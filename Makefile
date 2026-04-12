PYTHON ?= python3
POETRY ?= poetry

.PHONY: dev test lint format ci poetry-install poetry-dev poetry-test poetry-lint

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
