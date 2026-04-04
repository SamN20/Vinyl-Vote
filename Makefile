PYTHON ?= python3

.PHONY: dev test lint format ci

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
