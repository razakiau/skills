#!/bin/sh
# foundry doc-check v1.1.0
#
# Checks the agent docs of a repo: links, commands, decisions, the AGENTS.md
# budget, stage-required files and the precedence sentence.
# Usage: sh .agents/doc-check.sh [repo_root]
# Prints "doc-check: FAIL|WARN <rule>: <detail>" per finding, then a summary.
# Exits 1 if any FAIL, else 0. Needs only sh, grep, sed, find and awk.
set -eu

root=${1:-.}
if [ ! -d "$root" ]; then
  echo "doc-check: no such directory: $root" >&2
  exit 2
fi

PRECEDENCE='When this file and the code disagree, the code wins: say so, and propose the fix to this file.'
STATE_FILE="$root/.agents/foundry.json"

# Reads one scalar from the pretty-printed state file (one key per line).
state_value() {
  if [ -f "$STATE_FILE" ]; then
    sed -n "s/^[[:space:]]*\"$1\":[[:space:]]*\"*\([^\",]*\)\"*,*[[:space:]]*\$/\1/p" "$STATE_FILE" | sed -n 1p
  fi
}

stage=$(state_value stage)
has_ui=$(state_value has_ui)
budget=$(state_value budget_lines)
md_state=$(state_value state)
[ -n "$stage" ] || stage=explore
[ -n "$budget" ] || budget=100
[ -n "$md_state" ] || md_state=migrated
case $budget in
  *[!0-9]*) budget=100 ;;
esac

soft=FAIL
if [ "$md_state" = unmigrated ]; then soft=WARN; fi

finding() {
  echo "doc-check: $1 $2: $3"
}

# Markdown text with fenced code blocks removed.
prose() {
  awk '/^[[:space:]]*```/ { fence = !fence; next } !fence { print }' "$1"
}

# Link targets of a file, one per line: anchor, <angle brackets> and "title" stripped.
link_targets() {
  prose "$1" | grep -o '](\([^)]*\))' | sed \
    -e 's/^](//' -e 's/)$//' \
    -e 's/^[[:space:]]*//' \
    -e '/^[^<]/s/[[:space:]].*$//' \
    -e '/^</s/^<\([^>]*\)>.*$/\1/' \
    -e 's/#.*$//' || true
}

is_decision_name() {
  case $1 in
    */*) return 1 ;;
    [0-9][0-9][0-9][0-9]-*.md) return 0 ;;
  esac
  return 1
}

check_links() {
  for doc in AGENTS.md PRODUCT.md ARCHITECTURE.md GLOSSARY.md docs/decisions/index.md; do
    [ -f "$root/$doc" ] || continue
    case $doc in
      */*) dir=${doc%/*} ;;
      *) dir=. ;;
    esac
    link_targets "$root/$doc" | while IFS= read -r target; do
      case $target in
        '' | http:* | https:* | mailto:*) continue ;;
      esac
      # Decision files linked from the index belong to the decisions rule.
      if [ "$doc" = docs/decisions/index.md ] && is_decision_name "$target"; then continue; fi
      case $target in
        /*) path="$root$target" ;;
        *) path="$root/$dir/$target" ;;
      esac
      if [ ! -e "$path" ]; then finding FAIL link "$doc -> $target"; fi
    done
  done
}

check_decisions() {
  ddir="$root/docs/decisions"
  [ -d "$ddir" ] || return 0
  index="$ddir/index.md"
  linked=''
  if [ -f "$index" ]; then
    linked=$(link_targets "$index" | sed 's|^\./||')
  fi
  for f in "$ddir"/[0-9][0-9][0-9][0-9]-*.md; do
    [ -f "$f" ] || continue
    name=${f##*/}
    [ "$name" = 0000-template.md ] && continue
    if ! printf '%s\n' "$linked" | grep -Fqx -- "$name"; then
      finding FAIL decisions "docs/decisions/$name not linked from docs/decisions/index.md"
    fi
  done
  printf '%s\n' "$linked" | while IFS= read -r target; do
    is_decision_name "$target" || continue
    if [ ! -e "$ddir/$target" ]; then
      finding FAIL decisions "docs/decisions/index.md -> $target missing"
    fi
  done
}

# Prints "lineno<TAB>command" for each command in a ```sh block under a
# "## ...Check..." or "## ...Commands..." heading of AGENTS.md.
agents_commands() {
  awk '
    fence == 1 && /^[[:space:]]*```/ { fence = 0; next }
    fence == 1 {
      if (wanted && $0 !~ /^[[:space:]]*$/ && $0 !~ /^[[:space:]]*#/) print NR "\t" $0
      next
    }
    /^```sh[[:space:]]*$/ { fence = 1; wanted = section; next }
    /^[[:space:]]*```/ { fence = 1; wanted = 0; next }
    /^##[[:space:]]/ { section = ($0 ~ /Check/ || $0 ~ /Commands/); next }
    /^#[[:space:]]/ { section = 0; next }
  ' "$1"
}

check_command() {
  lineno=$1
  shift
  # Skip leading VAR=value assignments.
  while [ $# -gt 0 ]; do
    case $1 in
      [A-Za-z_]*=*) shift ;;
      *) break ;;
    esac
  done
  [ $# -gt 0 ] || return 0
  word=$1
  case $word in
    cd | export) return 0 ;;
    sh | node)
      if [ $# -gt 1 ]; then
        case $2 in
          -*) ;;
          *)
            if [ ! -e "$root/$2" ]; then finding FAIL command "AGENTS.md:$lineno $word script missing: $2"; fi
            ;;
        esac
      fi
      return 0
      ;;
    npx | pnpm | npm | cargo | make | mise | uv | python3) return 0 ;;
    */*)
      if [ -e "$root/$word" ]; then return 0; fi
      ;;
  esac
  if command -v "$word" >/dev/null 2>&1; then return 0; fi
  finding FAIL command "AGENTS.md:$lineno $word not found"
}

check_commands() {
  [ -f "$root/AGENTS.md" ] || return 0
  tab=$(printf '\t')
  agents_commands "$root/AGENTS.md" | while IFS="$tab" read -r lineno cmd; do
    set -f
    # shellcheck disable=SC2086 # word splitting is the point here
    set -- $cmd
    set +f
    check_command "$lineno" "$@"
  done
}

check_agents_md() {
  [ -f "$root/AGENTS.md" ] || return 0
  lines=$(awk 'END { print NR }' "$root/AGENTS.md")
  if [ "$lines" -gt "$budget" ]; then
    finding "$soft" budget "AGENTS.md has $lines lines, budget $budget"
  fi
  if ! grep -Fq -- "$PRECEDENCE" "$root/AGENTS.md"; then
    finding "$soft" precedence "AGENTS.md lacks the precedence sentence"
  fi
}

# Must match REQUIRED in foundry.mjs, in the same order.
check_required() {
  explore='AGENTS.md'
  product="$explore PRODUCT.md docs/decisions/index.md GLOSSARY.md ARCHITECTURE.md .agents/code-map.md DESIGN.md docs/ui/screens.md CONSTRAINTS.md"
  live="$product docs/threat-model.md docs/runbooks/"
  case $stage in
    explore) required=$explore ;;
    product) required=$product ;;
    live | scale) required=$live ;;
    *)
      finding FAIL state "unknown stage $stage in .agents/foundry.json"
      required=$explore
      ;;
  esac
  for f in $required; do
    case $f in DESIGN.md | docs/ui/screens.md) if [ "$has_ui" != true ]; then continue; fi ;; esac
    case $f in
      */) if [ ! -d "$root/$f" ]; then finding FAIL required "$f"; fi ;;
      *) if [ ! -f "$root/$f" ]; then finding FAIL required "$f"; fi ;;
    esac
  done
}

run_checks() {
  check_required
  check_links
  check_commands
  check_decisions
  check_agents_md
}

out=$(run_checks)
fails=0
warns=0
if [ -n "$out" ]; then
  printf '%s\n' "$out"
  fails=$(printf '%s\n' "$out" | grep -c '^doc-check: FAIL ' || true)
  warns=$(printf '%s\n' "$out" | grep -c '^doc-check: WARN ' || true)
fi
echo "doc-check: $fails fail, $warns warn"
if [ "$fails" -gt 0 ]; then exit 1; fi
exit 0
