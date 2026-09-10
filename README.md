# cosmoshack — КосмоХакатон Нижний Новгород (11–13 сентября)

Подготовка к старту. Цель — победа.

## Каркас приложений

- `frontend/` — React + TypeScript + Vite, слои `app`, `pages`, `widgets`,
  `features`, `entities`, `shared` как в `flowers_store`;
- `backend/` — FastAPI с тем же разделением на `api`, `core` и
  `infrastructure`; из прикладных API пока есть только авторизация;
- `ml/` — независимое тренировочное ядро по данным ростовского кейса;
- `docker-compose.yml` — полный запуск;
- `docker-compose.local.yml` — PostgreSQL, Redis и Ollama для разработки
  приложений напрямую на машине.

Полный запуск:

```bash
docker compose up --build
```

Команда поднимает frontend, backend, Taskiq worker, PostgreSQL, Redis и Ollama.
При первом запуске контейнер `ollama-pull` загрузит модель `qwen3:4b` (около
2,5 ГБ), поэтому первый старт будет дольше последующих. Модель сохраняется в
volume `ollama-data`.

Выбрать другую модель можно без правки compose:

```bash
COSMOS_OLLAMA_MODEL=qwen3:8b docker compose up --build
```

Для запуска backend и frontend на машине, а инфраструктуры в Docker:

```bash
docker compose -f docker-compose.local.yml up
```

## Сервер + Ollama на Mac через ngrok

На Mac заранее загрузите модель и поднимите защищённый туннель:

```bash
ollama pull qwen3:4b
ngrok http 11434 \
  --host-header="localhost:11434" \
  --basic-auth="cosmos:change-this-password"
```

Не публикуйте Ollama без авторизации. Оставьте Mac подключённым к питанию и
отключите сон на время демонстрации:

```bash
caffeinate -dimsu
```

На сервере создайте закрытый env-файл из примера, укажите публичные адреса
frontend, backend и ngrok, затем запустите compose без локальной Ollama:

```bash
cp .env.server.example .env.server
docker compose --env-file .env.server -f docker-compose.server.yml up --build -d
```

`docker-compose.server.yml` не публикует порты PostgreSQL и Redis. Frontend
обращается только к серверному FastAPI, а FastAPI вызывает Ollama через ngrok.
Файл `.env.server` с паролями не коммитьте.

## 📌 Начни отсюда
- **[PLAYBOOK.md](PLAYBOOK.md)** — стратегия на победу: расшифровка рубрики (100 б.),
  победный рецепт вегетационного кейса, главные ловушки, пред-стартовый чеклист,
  таймлайн 48–60 ч, роли.
- **[ml/](ml/)** — ML-компонент: leak-free config-driven ядро под метрику (30 б.), честная
  локальная оценка GapScore, строгий валидатор submission, baseline/anchor/модель,
  генерация `submission.csv`. Проверено на реальных данных Ростова.

Быстрый старт каркаса:
```bash
python3 -m pip install pandas numpy scikit-learn
python ml/local_eval.py --data ml/sample_data/train_dataset.csv --model --ensemble
```

## Материалы события
- Хаб серии: `космохакатон.рф` · площадка НН: `нн.космохакатон.рф`
- Личный кабинет НН: https://xn--m1aa.xn--80aa2abijcbdyq6a.xn--p1ai/personal/profile

## Референс-решения Ростова (тот же организатор, кейсы ДЗЗ)
- https://github.com/Benzocloud/cosmohack — честное, сильное (TerraLens), образец
- https://github.com/soyzy-code1/cosmoHack_AgroML — проще; пример **ловушки утечки** признаков

## Кейсы Ростова (4–6 сентября, фонд 1,2 млн ₽) — вероятный ориентир для НН
- 🌱 **«Мониторинг вегетационной динамики»** (ООО «СР КМС») — ДЗЗ, восстановление
  ряда NDVI, аномалии, автоматическая метрика. Наш основной фокус подготовки.
- 🌊 **«Чистый берег»** (ООО «СР Дата») — продуктовый: приложение/мероприятия для
  популяризации эко-анализа поверхности планеты.

> Кейсы НН объявляются на платформе события (вероятно, в день старта). Готовимся к
> вегетационному кейсу как к наиболее вероятному и наиболее «выигрываемому»
> инженерно; картографический скелет пригодится под любой из кейсов.
