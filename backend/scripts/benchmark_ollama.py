"""Run with backend/.venv/bin/python backend/scripts/benchmark_ollama.py."""

import asyncio
import json
import os
from pathlib import Path
import re
import shutil
import statistics
import subprocess
import sys
import tempfile
import time

import aiohttp

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.clients.ollama_client import OllamaClient
from app.core.dto.portfolio import RecommendRequest
from app.core.services.explanation_evidence import render_evidence
from app.core.dto.portfolio import ExplanationFact
from app.core.services.ollama_service import OllamaService
from app.core.services.portfolio_service import PortfolioService
from app.core.services.recommendation_summary_service import RecommendationSummaryService
from app.infrastructure.errors.ollama_errors import OllamaUnavailableError


HOST = "http://127.0.0.1:11435"
MODEL = os.environ.get("COSMOS_OLLAMA_MODEL", "qwen3:4b-instruct")


class CaptureFacts:
    model = MODEL

    async def select_evidence(self, portfolios):
        self.portfolios = portfolios
        raise OllamaUnavailableError("benchmark: capture input only")


async def inputs():
    capture = CaptureFacts()
    await RecommendationSummaryService().recommend(
        RecommendRequest(dataset_hash=PortfolioService().catalog().dataset_hash), capture,
    )
    return capture.portfolios


def snapshot(pid):
    rows = subprocess.check_output(["ps", "-axo", "pid=,ppid=,%cpu=,rss="], text=True)
    processes = [line.split() for line in rows.splitlines()]
    descendants = {pid}
    for _ in range(4):
        descendants.update(int(row[0]) for row in processes if int(row[1]) in descendants)
    selected = [row for row in processes if int(row[0]) in descendants]
    gpu = subprocess.check_output(["ioreg", "-r", "-c", "IOAccelerator", "-l"], text=True)
    utilization = re.search(r'"Device Utilization %"=(\d+)', gpu)
    swap = subprocess.check_output(["sysctl", "-n", "vm.swapusage"], text=True)
    swap_used = re.search(r"used = ([\d.]+)M", swap)
    return {
        "cpu_percent": sum(float(row[2]) for row in selected),
        "rss_mib": sum(int(row[3]) for row in selected) / 1024,
        "system_gpu_percent": int(utilization[1]) if utilization else None,
        "system_swap_mib": float(swap_used[1]) if swap_used else None,
    }


async def loaded_model():
    async with aiohttp.ClientSession() as session:
        async with session.get(f"{HOST}/api/ps") as response:
            payload = await response.json()
            return [{key: model.get(key) for key in ("name", "size", "size_vram", "context_length")} for model in payload["models"]]


async def run_test(ollama, portfolios, kind, parallel, pid):
    samples = []
    stop = asyncio.Event()

    async def monitor():
        while not stop.is_set():
            samples.append(await asyncio.to_thread(snapshot, pid))
            try:
                await asyncio.wait_for(stop.wait(), timeout=0.5)
            except TimeoutError:
                pass

    async def request(group):
        draft, response = await ollama.select_evidence(group)
        facts = {p["key"]: [ExplanationFact(**f) for f in p["facts"]] for p in group}
        for item in draft.items:
            render_evidence(item.key, facts[item.key], item)
        return {key: getattr(response, key) for key in ("prompt_eval_count", "eval_count", "total_duration")}

    monitor_task = asyncio.create_task(monitor())
    started = time.perf_counter()
    try:
        if kind == "batch":
            timings = [await request(portfolios)]
        else:
            slot = asyncio.Semaphore(parallel)

            async def individual(portfolio):
                async with slot:
                    return await request([portfolio])

            timings = await asyncio.gather(*(individual(p) for p in portfolios))
        elapsed = time.perf_counter() - started
    finally:
        stop.set()
        await monitor_task
    return {
        "strategy": kind, "parallel": parallel, "seconds": round(elapsed, 3), "valid": True,
        "cpu_mean_percent": round(statistics.mean(s["cpu_percent"] for s in samples), 1),
        "rss_peak_mib": round(max(s["rss_mib"] for s in samples), 1),
        "system_gpu_mean_percent": round(statistics.mean(s["system_gpu_percent"] for s in samples if s["system_gpu_percent"] is not None), 1),
        "system_gpu_peak_percent": max(s["system_gpu_percent"] for s in samples if s["system_gpu_percent"] is not None),
        "swap_start_mib": samples[0]["system_swap_mib"], "swap_end_mib": samples[-1]["system_swap_mib"],
        "model": await loaded_model(), "requests": timings,
    }


async def main():
    if sys.platform != "darwin":
        raise SystemExit("This benchmark measures native Ollama on macOS.")
    executable = shutil.which("ollama")
    if not executable:
        raise SystemExit("Install Ollama first.")
    import socket
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 11435))
    portfolios = await inputs()
    results = []
    for parallel in (1, 2, 5):
        env = {**os.environ, "OLLAMA_HOST": "127.0.0.1:11435", "OLLAMA_NUM_PARALLEL": str(parallel)}
        with tempfile.TemporaryFile() as log:
            process = subprocess.Popen([executable, "serve"], env=env, stdout=log, stderr=log)
            client = None
            try:
                async with aiohttp.ClientSession() as session:
                    for _ in range(60):
                        if process.poll() is not None:
                            raise RuntimeError("Benchmark Ollama exited before startup")
                        try:
                            async with session.get(f"{HOST}/api/version") as response:
                                if response.status == 200:
                                    break
                        except aiohttp.ClientError:
                            pass
                        await asyncio.sleep(0.25)
                    else:
                        raise RuntimeError("Benchmark Ollama failed to start")
                client = OllamaClient(HOST, 65)
                ollama = OllamaService(client, MODEL)
                kinds = ("batch", "individual") if parallel == 1 else ("individual",)
                for kind in kinds:
                    try:
                        warmup = await run_test(ollama, portfolios, kind, parallel, process.pid)
                        print(json.dumps({"warmup": warmup}, ensure_ascii=False), flush=True)
                    except Exception as error:
                        print(json.dumps({"warmup_error": str(error), "strategy": kind, "parallel": parallel}), flush=True)
                    for repeat in range(3):
                        try:
                            result = await run_test(ollama, portfolios, kind, parallel, process.pid)
                            result["repeat"] = repeat
                        except Exception as error:
                            result = {"strategy": kind, "parallel": parallel, "repeat": repeat, "valid": False, "error": str(error)}
                        results.append(result)
                        print(json.dumps(result, ensure_ascii=False), flush=True)
            finally:
                if client:
                    await client.close()
                if process.poll() is None:
                    process.terminate()
                    try:
                        await asyncio.to_thread(process.wait, timeout=10)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        await asyncio.to_thread(process.wait)
    print(json.dumps({"results": results, "note": "No backend result cache. GPU and swap are system-wide; CPU/RSS cover benchmark Ollama and its children."}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    asyncio.run(main())
