"""Регрессии безопасной сверки и упаковки; без пересчёта пространства портфелей."""

import json
import subprocess
import sys
import signal
from pathlib import Path

import pytest

from backend.app.core.services.portfolio_engine import export_integrity
from scripts import build_submission, render_pdf, sync_documents


@pytest.fixture
def document_fixture(tmp_path, monkeypatch):
    note = tmp_path / 'note.md'
    snapshot = tmp_path / 'document_facts.json'
    note.write_text('Δ = 9,5; FLOOD S = 99,50.', encoding='utf-8')
    snapshot.write_text(json.dumps({'Δ': '9,5'}), encoding='utf-8')
    monkeypatch.setattr(sync_documents, 'ROOT', tmp_path)
    monkeypatch.setattr(sync_documents, 'SNAPSHOT', snapshot)
    monkeypatch.setattr(sync_documents, 'collect', lambda: {'Δ': ('8,5', ('note.md',))})
    monkeypatch.setattr(sync_documents, 'relations', lambda: [])
    return note, snapshot


@pytest.mark.parametrize('text,value,expected', [
    ('FLOOD 99,50', '9,5', False), ('Q 0,50', '0,5', False),
    ('C0 1180', '8', False), ('Δ = 9,5; другой', '9,5', True),
    ('Δ = 9,5. Затем', '9,5', True), ('Δ = 9,5, затем', '9,5', True),
])
def test_numeric_values_are_whole_tokens(text, value, expected):
    assert sync_documents.contains_value(text, value) is expected


@pytest.mark.parametrize('flags', [[], ['--fix'], ['--snapshot']])
def test_changed_unmarked_fact_fails_without_touching_documents(document_fixture, monkeypatch, flags):
    note, snapshot = document_fixture
    before = note.read_bytes(), snapshot.read_bytes()
    monkeypatch.setattr(sys, 'argv', ['sync_documents.py', *flags])
    assert sync_documents.main() == 1
    assert (note.read_bytes(), snapshot.read_bytes()) == before


def test_fix_is_bound_to_the_fact_name_not_equal_numbers(document_fixture, monkeypatch):
    note, snapshot = document_fixture
    note.write_text('Δ = <!-- fact: Δ -->9,5<!-- /fact -->; FLOOD S = 99,50.', encoding='utf-8')
    monkeypatch.setattr(sys, 'argv', ['sync_documents.py', '--fix'])
    assert sync_documents.main() == 0
    assert note.read_text() == 'Δ = <!-- fact: Δ -->8,5<!-- /fact -->; FLOOD S = 99,50.'
    assert json.loads(snapshot.read_text()) == {'Δ': '8,5'}


@pytest.mark.parametrize('flags', [['--fix'], ['--snapshot']])
def test_old_unmarked_occurrence_blocks_fix_and_snapshot(document_fixture, monkeypatch, flags):
    note, snapshot = document_fixture
    note.write_text('Δ = <!-- fact: Δ -->9,5<!-- /fact -->; повтор Δ = 9,5.', encoding='utf-8')
    before = note.read_bytes(), snapshot.read_bytes()
    monkeypatch.setattr(sys, 'argv', ['sync_documents.py', *flags])
    assert sync_documents.main() == 1
    assert (note.read_bytes(), snapshot.read_bytes()) == before


def test_equal_numbers_of_different_facts_are_not_changed(document_fixture, monkeypatch):
    note, snapshot = document_fixture
    note.write_text('<!-- fact: Δ -->9,5<!-- /fact -->; <!-- fact: другой -->9,5<!-- /fact -->')
    snapshot.write_text(json.dumps({'Δ': '9,5', 'другой': '9,5'}))
    monkeypatch.setattr(sync_documents, 'collect', lambda: {
        'Δ': ('8,5', ('note.md',)), 'другой': ('9,5', ('note.md',)),
    })
    monkeypatch.setattr(sys, 'argv', ['sync_documents.py', '--fix'])
    assert sync_documents.main() == 0
    assert '<!-- fact: другой -->9,5<!-- /fact -->' in note.read_text()


def test_snapshot_does_not_hide_an_old_marker(document_fixture, monkeypatch):
    note, snapshot = document_fixture
    note.write_text('<!-- fact: Δ -->9,5<!-- /fact -->; 8,5 тоже встречается')
    previous = snapshot.read_bytes()
    monkeypatch.setattr(sys, 'argv', ['sync_documents.py', '--snapshot'])
    assert sync_documents.main() == 1
    assert snapshot.read_bytes() == previous


def test_check_does_not_create_a_snapshot(document_fixture, monkeypatch):
    note, snapshot = document_fixture
    snapshot.unlink()
    note.write_text('Δ = 8,5')
    monkeypatch.setattr(sys, 'argv', ['sync_documents.py'])
    assert sync_documents.main() == 0
    assert not snapshot.exists()


@pytest.mark.parametrize('outcome', ['pass', 'too_many_pages', 'render_error'])
def test_pdf_check_preserves_committed_pdf_and_cleans_scratch(tmp_path, monkeypatch, outcome):
    target = tmp_path / 'note.pdf'
    target.write_bytes(b'committed PDF')
    outputs = []
    monkeypatch.setattr(render_pdf, 'ROOT', tmp_path)
    monkeypatch.setattr(render_pdf, 'CHROME', Path(sys.executable))
    monkeypatch.setattr(render_pdf, 'JOBS', [dict(
        source='note.md', target='note.pdf', size='10pt', allowed=range(1, 2), declares=False,
    )])

    def fake_render(_job, path):
        assert path != target
        outputs.append(path)
        path.write_bytes(b'new PDF')
        if outcome == 'render_error':
            raise RuntimeError('render failed')
        return 1 if outcome == 'pass' else 2

    monkeypatch.setattr(render_pdf, 'render_job', fake_render)
    monkeypatch.setattr(sys, 'argv', ['render_pdf.py', '--check'])
    if outcome == 'render_error':
        with pytest.raises(RuntimeError, match='render failed'):
            render_pdf.main()
    else:
        assert render_pdf.main() == (0 if outcome == 'pass' else 1)
    assert target.read_bytes() == b'committed PDF'
    assert outputs and all(not path.exists() for path in outputs)


@pytest.mark.parametrize('case,expected', [
    ('complete', True), ('partial', False), ('wrong_size', False),
    ('old_confirmation', False), ('other_suffix', False), ('no_confirmation', False),
])
def test_pdf_completion_requires_its_own_complete_file_and_exact_confirmation(tmp_path, case, expected):
    pdf, log = tmp_path / 'new.pdf', tmp_path / 'chrome.log'
    data = b'%PDF-1.7\n/Count 1\n%%EOF\n'
    pdf.write_bytes(data if case != 'partial' else data[:-6])
    size = len(data) + (1 if case == 'wrong_size' else 0)
    path = tmp_path / 'old.pdf' if case == 'old_confirmation' else pdf
    if case == 'other_suffix':
        path = Path(str(pdf) + '.other')
    log.write_text('' if case == 'no_confirmation' else f'{size} bytes written to file {path}\n')
    assert render_pdf.completed_pdf(pdf, log) is expected


def test_chrome_cleanup_kills_only_the_created_process_group(monkeypatch):
    calls = []

    class Process:
        pid = 12345
        waits = 0

        def wait(self, timeout):
            self.waits += 1
            if self.waits == 1:
                raise subprocess.TimeoutExpired('chrome', timeout)
            return 0

    monkeypatch.setattr(render_pdf.os, 'killpg', lambda pid, signum: calls.append((pid, signum)))
    process = Process()
    render_pdf.stop_chrome(process)
    assert calls == [(12345, signal.SIGTERM), (12345, signal.SIGKILL)]
    assert process.waits == 2


def test_failed_chrome_render_preserves_the_previous_target(tmp_path, monkeypatch):
    target = tmp_path / 'final.pdf'
    target.write_bytes(b'previous PDF')
    cleaned = []

    class FailedProcess:
        def poll(self):
            return 1

    def failed_launch(command, **kwargs):
        assert kwargs['start_new_session'] is True
        print_target = next(value.split('=', 1)[1] for value in command if value.startswith('--print-to-pdf='))
        assert Path(print_target) != target
        return FailedProcess()

    monkeypatch.setattr(render_pdf.subprocess, 'Popen', failed_launch)
    monkeypatch.setattr(render_pdf, 'stop_chrome', lambda process: cleaned.append(process))
    with pytest.raises(RuntimeError, match='без готового PDF'):
        render_pdf.render('# Temporary input', target, '10pt')
    assert target.read_bytes() == b'previous PDF'
    assert len(cleaned) == 1


@pytest.mark.parametrize('change', ['config', 'case', 'implementation', 'result', 'missing_result'])
def test_export_manifest_rejects_stale_sources_or_results(tmp_path, monkeypatch, change):
    code = tmp_path / 'implementation'
    code.mkdir()
    source = code / 'export_integrity.py'
    source.write_text('implementation version 1')
    config = tmp_path / 'decision.json'
    config.write_text('{"version": 1}')
    monkeypatch.setattr(export_integrity, '__file__', str(source))
    monkeypatch.setattr(export_integrity, 'dataset_hash', lambda: 'case version 1')
    for name in export_integrity.EXPORT_FILES:
        (tmp_path / name).write_text('result version 1')
    export_integrity.write_export_manifest(tmp_path, config)
    export_integrity.verify_export(tmp_path, config)
    if change == 'config':
        config.write_text('{"version": 2}')
    elif change == 'case':
        monkeypatch.setattr(export_integrity, 'dataset_hash', lambda: 'case version 2')
    elif change == 'implementation':
        source.write_text('implementation version 2')
    elif change == 'result':
        (tmp_path / export_integrity.EXPORT_FILES[0]).write_text('modified result')
    else:
        (tmp_path / export_integrity.EXPORT_FILES[0]).unlink()
    with pytest.raises(ValueError, match='устарел'):
        export_integrity.verify_export(tmp_path, config)


def test_skip_export_rejects_stale_artifacts_before_changing_bundle(tmp_path, monkeypatch):
    output = tmp_path / 'bundle'
    output.mkdir()
    sentinel = output / 'existing.txt'
    sentinel.write_text('keep')

    def no_compute(*_args, **_kwargs):
        pytest.fail('--skip-export must not recalculate')

    def stale(*_args, **_kwargs):
        raise ValueError('export устарел')

    monkeypatch.setattr(build_submission.subprocess, 'run', no_compute)
    monkeypatch.setattr(build_submission, 'verify_export', stale)
    monkeypatch.setattr(sys, 'argv', ['build_submission.py', '--output', str(output), '--skip-export'])
    with pytest.raises(SystemExit) as error:
        build_submission.main()
    assert error.value.code == 2
    assert list(output.iterdir()) == [sentinel]
    assert sentinel.read_text() == 'keep'


def test_bundle_adapts_test_imports_without_a_second_root_package(tmp_path, monkeypatch):
    output = tmp_path / 'bundle'
    run = subprocess.run

    def no_compute(*_args, **_kwargs):
        pytest.fail('--skip-export must not recalculate')

    monkeypatch.setattr(build_submission.subprocess, 'run', no_compute)
    monkeypatch.setattr(build_submission, 'verify_export', lambda *_args: None)
    monkeypatch.setattr(sys, 'argv', ['build_submission.py', '--output', str(output), '--skip-export'])
    build_submission.main()
    result = run([sys.executable, '-m', 'pytest', 'tests', '--collect-only', '-q', '-p', 'no:cacheprovider'],
                 cwd=output, text=True, capture_output=True)
    assert result.returncode == 0, result.stdout + result.stderr
    assert 'test_default_config_and_overrides_forwarded_to_one_search' in result.stdout
    for copied_test in (output / 'tests').glob('test_*.py'):
        assert build_submission.ENGINE_MODULE not in copied_test.read_text()
    assert not (output / 'docs/research/access-mode-d.md').exists()
    assert not (output / 'docs/research/portfolio-audit-results.json').exists()


def test_existing_package_is_directly_executable_without_root_engine():
    result = subprocess.run(
        [sys.executable, '-m', build_submission.ENGINE_MODULE, '--help'],
        cwd=Path(__file__).resolve().parents[1], text=True, capture_output=True, check=True,
    )
    assert f'python -m {build_submission.ENGINE_MODULE}' in result.stdout
    assert 'recommend' in result.stdout and 'export' in result.stdout
