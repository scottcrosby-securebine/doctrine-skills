#!/bin/sh
# Builds one pristine copy of the E9 fixture phase: a git repo holding app/, with the phase
# record at .doctrine/records/slug.md, excluded from version control. Prints the fixed point.
# Usage: sh fixtures/e9-phase/setup.sh <new-empty-directory>
set -eu
dest=${1:?usage: setup.sh <new-empty-directory>}
here=$(cd "$(dirname "$0")" && pwd)
[ ! -e "$dest" ] || [ -z "$(ls -A "$dest")" ] || { echo "setup.sh: $dest is not empty" >&2; exit 2; }
mkdir -p "$dest"
cp -R "$here/app/." "$dest/"
cd "$dest"
git init -q -b main
git add -A
git -c user.name=fixture -c user.email=fixture@example.invalid commit -q -m "slug: fixture at the fixed point"
sha=$(git rev-parse HEAD)
now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
mkdir -p .doctrine/records
echo "/.doctrine/" >> .git/info/exclude
sed -e "s/FIXEDPOINT_SHA/$sha/" -e "s/FIXEDPOINT_TIME/$now/" "$here/record.md" > .doctrine/records/slug.md
echo "$sha"
