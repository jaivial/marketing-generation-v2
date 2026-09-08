# Contributing

Thanks for helping ship Menu Studio AI. Keep changes small and shippable.

## Development setup

```bash
git clone <repo-url> && cd <repo>
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd frontend && npm ci && npm run build && cd ..
cp .env.example .env
```

Fill in `.env` with at least: `MINIMAX_API_KEY`, `WAVESPEED_API_KEY`,
`STRIPE_RK_LIVE`, `STRIPE_WEBHOOK_SECRET`.

## Running locally

```bash
uvicorn app.main:app --reload
```

## Tests

```bash
pytest tests/
```

The suite has 211 tests and must stay green before every push.

## Pull request conventions

- One feature per PR. No bundled, unrelated changes.
- Include a short description and link the issue it closes.
- Conventional commits only: `feat:`, `fix:`, `chore:`, `refactor:`.
- The PR must pass the CI workflow in `.github/workflows/ci.yml`.
