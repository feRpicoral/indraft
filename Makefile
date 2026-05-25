.PHONY: setup dev build test typecheck lint format dry-run check-token auth clean

setup:
	yarn setup

dev:
	yarn dev

build:
	yarn build

test:
	yarn test

typecheck:
	yarn typecheck

lint:
	yarn lint

format:
	yarn format

dry-run:
	yarn dry-run

check-token:
	yarn indraft check-token

auth:
	yarn indraft auth

clean:
	rm -rf .next dist coverage .yarn/cache .yarn/install-state.gz
