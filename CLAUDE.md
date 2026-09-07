# Working in this repo

## Don't run Prettier

Never run `prettier --write` (or any formatter) over files in this repo, and
don't "fix formatting" as a side errand. There is a `.prettierrc`, but the
codebase is not kept Prettier-clean — most files fail `prettier --check`, and
there's no format script or pre-commit hook. Running it rewrites code you
didn't touch and buries the actual change in reformatting noise.

Match the surrounding style of whatever file you're editing instead: tabs for
indentation, double quotes, semicolons.
