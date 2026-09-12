"""Start the web app with optional Ollama; Python standard library only."""

import argparse
import os
from pathlib import Path
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]


def build_plan(args: argparse.Namespace) -> tuple[dict[str, str], list[list[str]]]:
    env = os.environ.copy()
    env["COSMOS_OLLAMA_ENABLED"] = "false" if args.ollama == "off" else "true"
    # The command selects the backend URL explicitly; no editing a user's .env.
    if args.ollama == "on":
        env["COSMOS_OLLAMA_BASE_URL"] = "http://ollama:11434"
    elif args.ollama == "host":
        env["COSMOS_OLLAMA_BASE_URL"] = args.ollama_url or "http://host.docker.internal:11434"
    if args.model:
        env["COSMOS_OLLAMA_MODEL"] = args.model

    compose = ["docker", "compose", "-f", str(ROOT / "docker-compose.yml")]
    if args.project_name:
        compose += ["--project-name", args.project_name]
    if args.env_file:
        compose += ["--env-file", str(Path(args.env_file).resolve())]
    commands = [compose + ["up", "-d", "--build", "--wait", "app", "frontend"]]
    llm = compose + ["--profile", "container-llm"]
    if args.ollama == "on":
        # Pulling is asynchronous: model readiness must not block calculations.
        commands.append(llm + ["up", "-d", "ollama-pull"])
    else:
        # Only this Compose project's containers; never stop native/remote Ollama.
        # No `down -v`: downloaded models remain available for the next start.
        commands.append(llm + ["stop", "ollama-pull", "ollama"])
    return env, commands


def main() -> int:
    parser = argparse.ArgumentParser(description="Локальный запуск Cosmos Hack без обязательной LLM")
    parser.add_argument("--ollama", choices=("off", "on", "host"), default="off",
                        help="off — без модели; on — скачать и запустить в Docker; host — уже установленная Ollama")
    parser.add_argument("--model", help="Модель Ollama; по умолчанию значение Compose/.env")
    parser.add_argument("--ollama-url", help="Адрес Ollama из контейнера backend; только с --ollama host")
    parser.add_argument("--env-file", help="Дополнительные настройки Compose, например порты")
    parser.add_argument("--project-name", help="Изолированное имя Docker Compose проекта")
    args = parser.parse_args()
    if args.ollama_url and args.ollama != "host":
        parser.error("--ollama-url используется только с --ollama host")
    env, commands = build_plan(args)
    try:
        for command in commands:
            subprocess.run(command, cwd=ROOT, env=env, check=True)
    except FileNotFoundError:
        print("Не найден Docker. Установите и запустите Docker Desktop / Docker Engine с Compose.", file=sys.stderr)
        return 1
    except subprocess.CalledProcessError as error:
        print("Запуск не завершён. Проверьте сообщение Docker выше; расчётный CLI доступен без Docker.", file=sys.stderr)
        return error.returncode
    print("Интерфейс: http://localhost:5173 (при изменении COSMOS_WEB_HOST_PORT используйте свой порт).")
    if args.ollama == "on":
        print("Модель загружается в volume. Расчёты доступны сразу; AI-объяснения — после готовности модели.")
        print("Прогресс: docker compose logs -f ollama-pull (с теми же --project-name/--env-file, если заданы).")
    elif args.ollama == "host":
        print("Используется установленная Ollama. При её недоступности расчёты продолжают работать.")
    else:
        print("Ollama отключена. Расчёты, сравнение, сохранение и экспорт доступны; AI-объяснения отключены.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
