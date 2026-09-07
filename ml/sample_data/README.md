# Практические данные (Ростов) — только для тренировки

Это **публичные reference-данные ростовского вегетационного кейса**
(из `github.com/soyzy-code1/cosmoHack_AgroML`), чтобы обкатать каркас ДО старта НН.

- `train_dataset.csv` — 99 955 строк, 39 полигонов, известный `primary_ndvi`.
- `test.csv` — тестовый файл с `is_synthetic_gap=True` (3112 контрольных строк),
  аналог `private_features.csv`.

На старте НН замени их на данные события. Соревновательные данные НН **не
коммить** в репозиторий (см. `.gitignore`) — сверься с правилами.

Обкатка:
```bash
python ml/local_eval.py --data ml/sample_data/train_dataset.csv --model
python ml/make_submission.py \
    --context ml/sample_data/train_dataset.csv \
    --test ml/sample_data/test.csv \
    --out submission.csv --model
```
