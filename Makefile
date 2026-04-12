PYTHON ?= python3
POETRY ?= poetry

.PHONY: dev test lint format ci poetry-install poetry-dev poetry-test poetry-lint dev-stack dev-stack-detached

dev:
	$(PYTHON) run.py

test:
	$(PYTHON) -m pytest

lint:
	$(PYTHON) -m ruff check . --select E9,F63,F7,F82
	$(PYTHON) -m compileall app tests run.py config.py

format:
	$(PYTHON) -m ruff check . --fix
	$(PYTHON) -m black .
	$(PYTHON) -m isort .

ci: lint test

poetry-install:
	$(POETRY) install

poetry-dev:
	$(POETRY) run python run.py

poetry-test:
	$(POETRY) run pytest

poetry-lint:
	$(POETRY) run ruff check . --select E9,F63,F7,F82
	$(POETRY) run python -m compileall app tests run.py config.py

# Start full development stack: backend (docker) + frontend (vite)
# - `make dev-stack` will bring up the Docker web service and then
#   run the frontend `npm run dev` in the foreground.
# - `make dev-stack-detached` will only bring up the Docker web service
#   (useful if you prefer to run the frontend in a separate terminal).
dev-stack:
	docker compose up -d --build
	cd frontend && npm install --no-audit --no-fund || true
	cd frontend && npm run dev

dev-stack-detached:
	docker compose up -d --build
	@echo "Docker services started. Run 'cd frontend && npm run dev' to start the frontend dev server."
