#!/bin/sh
# foundry doc-check v1.4.1
#
# Checks the agent docs of a repo: links, commands, decisions, the AGENTS.md
# budget, stage-required files, the precedence sentence, and whether the maps
# still match the code: cited paths exist, source folders are named, and the
# last garden pass is not too far back.
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
state_unread=
if [ -f "$STATE_FILE" ] && [ -z "$stage" ]; then state_unread=1; fi
[ -n "$stage" ] || stage=explore
[ -n "$budget" ] || budget=100
[ -n "$md_state" ] || md_state=migrated
case $budget in
  *[!0-9]*) budget=100 ;;
esac

soft=FAIL
if [ "$md_state" = unmigrated ]; then soft=WARN; fi

# Where the state records a required doc, else its default place. Must match PATH_KEYS in foundry.mjs.
recorded() {
  case $1 in
    PRODUCT.md) key=product_md ;;
    docs/decisions/index.md) key=decisions_index ;;
    GLOSSARY.md) key=glossary_md ;;
    ARCHITECTURE.md) key=architecture_md ;;
    docs/code-map.md) key=code_map ;;
    DESIGN.md) key=design_md ;;
    docs/ui/screens.md) key=screens_md ;;
    CONSTRAINTS.md) key=constraints_md ;;
    docs/threat-model.md) key=threat_model ;;
    docs/runbooks/) key=runbooks_dir ;;
    *) echo "$1"; return 0 ;;
  esac
  v=$(state_value "$key")
  if [ -n "$v" ]; then echo "$v"; else echo "$1"; fi
}
decisions_index=$(recorded docs/decisions/index.md)
case $decisions_index in
  */*) decisions_dir=${decisions_index%/*} ;;
  *) decisions_dir=. ;;
esac

finding() {
  echo "doc-check: $1 $2: $3"
}

# Markdown text with fenced code blocks (``` or ~~~) and inline code spans removed.
prose() {
  awk '
    /^[[:space:]]*(```|~~~)/ { fence = !fence; next }
    !fence { gsub(/`[^`]*`/, ""); print }
  ' "$1"
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
  for doc in AGENTS.md "$(recorded PRODUCT.md)" "$(recorded ARCHITECTURE.md)" "$(recorded GLOSSARY.md)" "$decisions_index"; do
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
      if [ "$doc" = "$decisions_index" ] && is_decision_name "${target#./}"; then continue; fi
      case $target in
        /*) path="$root$target" ;;
        *) path="$root/$dir/$target" ;;
      esac
      if [ ! -e "$path" ]; then finding FAIL link "$doc -> $target"; fi
    done
  done
}

check_decisions() {
  ddir="$root/$decisions_dir"
  [ -d "$ddir" ] || return 0
  index="$root/$decisions_index"
  linked=''
  if [ -f "$index" ]; then
    linked=$(link_targets "$index" | sed 's|^\./||')
  fi
  for f in "$ddir"/[0-9][0-9][0-9][0-9]-*.md; do
    [ -f "$f" ] || continue
    name=${f##*/}
    [ "$name" = 0000-template.md ] && continue
    if ! printf '%s\n' "$linked" | grep -Fqx -- "$name"; then
      finding FAIL decisions "$decisions_dir/$name not linked from $decisions_index"
    fi
  done
  printf '%s\n' "$linked" | while IFS= read -r target; do
    is_decision_name "$target" || continue
    if [ ! -e "$ddir/$target" ]; then
      finding FAIL decisions "$decisions_index -> $target missing"
    fi
  done
}

# Prints "lineno<TAB>command" for each command in a ```sh block under a
# "## ...Check..." or "## ...Commands..." heading of AGENTS.md. A line ending
# in a backslash continues on the next one; lineno is the first line.
agents_commands() {
  awk '
    fence == 1 && /^[[:space:]]*```/ { if (cmd != "") print start "\t" cmd; cmd = ""; fence = 0; next }
    fence == 1 {
      if (!wanted) next
      if (cmd == "" && ($0 ~ /^[[:space:]]*$/ || $0 ~ /^[[:space:]]*#/)) next
      line = $0
      more = sub(/\\[[:space:]]*$/, "", line)
      if (cmd == "") { start = NR; cmd = line } else cmd = cmd " " line
      if (!more) { print start "\t" cmd; cmd = "" }
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

# Must match REQUIRED in foundry.mjs, in the same order. Each file stands for
# its recorded path, when the state records one. The code map still counts at its old place,
# .agents/code-map.md, with a WARN to move it.
check_required() {
  if [ -n "$state_unread" ]; then
    finding WARN state ".agents/foundry.json has no stage on its own line; write it 2-space, one key per line"
  fi
  explore='AGENTS.md'
  product="$explore PRODUCT.md docs/decisions/index.md GLOSSARY.md ARCHITECTURE.md docs/code-map.md DESIGN.md docs/ui/screens.md CONSTRAINTS.md"
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
    f=$(recorded "$f")
    if [ "$f" = docs/code-map.md ] && [ ! -f "$root/$f" ] && [ -f "$root/.agents/code-map.md" ]; then
      finding WARN required ".agents/code-map.md is the old place for the code map; move it with git mv .agents/code-map.md docs/code-map.md"
      continue
    fi
    case $f in
      */) if [ ! -d "$root/$f" ]; then finding FAIL required "$f"; fi ;;
      *) if [ ! -f "$root/$f" ]; then finding FAIL required "$f"; fi ;;
    esac
  done
}

# Inline code spans outside fenced blocks, one per line. A line that says a
# file is gone (deleted, removed, retired, renamed, moved) cites it on purpose.
code_spans() {
  awk '
    /^[[:space:]]*(```|~~~)/ { fence = !fence; next }
    fence { next }
    tolower($0) ~ /(delet|remov|retir|renam|moved|replaced)/ { next }
    {
      line = $0
      while (match(line, /`[^`]+`/)) {
        print substr(line, RSTART + 1, RLENGTH - 2)
        line = substr(line, RSTART + RLENGTH)
      }
    }
  ' "$1"
}

# A span is a repo path when it has no spaces, globs or variables, contains a
# slash or ends in a file extension, and its first part exists at the top: so
# ghcr.io/x, run/secrets or another repo's docs/foo.md in a repo without docs/
# are left alone. Gitignored paths (.env.local, data/app.db) are skipped.
repo_path() {
  p=${1#./}
  case $p in
    '' | *' '* | *'*'* | *'?'* | *'$'* | *'{'* | *'<'* | *'~'* | *:* | -* | /* | *..*) return 1 ;;
    */* | *.md | *.ts | *.tsx | *.js | *.mjs | *.py | *.rs | *.go | *.sh | *.sql | *.json | *.toml | *.yml | *.yaml) ;;
    *) return 1 ;;
  esac
  first=${p%%/*}
  [ "$first" = "$p" ] && first=$p
  [ -e "$root/$first" ] || return 1
  if command -v git >/dev/null 2>&1 && git -C "$root" check-ignore -q -- "$p" 2>/dev/null; then return 1; fi
  echo "$p"
}

# A path a doc cites that no longer exists. In the maps (code map, screen
# map) it is a FAIL: they exist to say where things are. In prose, a WARN.
# Every tracked path and its folders, for a path cited relative to a subfolder
# (harness/proxy.rs for src/harness/proxy.rs).
all_paths() {
  if command -v git >/dev/null 2>&1 && git -C "$root" rev-parse -q --verify HEAD >/dev/null 2>&1; then
    git -C "$root" ls-files
  else
    (cd "$root" && find . -path ./.git -prune -o -type f -print | sed 's|^\./||')
  fi | awk -F/ '{ p = ""; for (i = 1; i <= NF; i++) { p = (i == 1 ? $1 : p "/" $i); print p } }' | sort -u
}

# The code map where it is: the recorded path, or the old .agents/code-map.md.
code_map_file() {
  m=$(recorded docs/code-map.md)
  if [ ! -f "$root/$m" ] && [ -f "$root/.agents/code-map.md" ]; then m=.agents/code-map.md; fi
  echo "$m"
}

check_paths() {
  known=$(all_paths)
  map=$(code_map_file)
  for doc in "$map" "$(recorded docs/ui/screens.md)" AGENTS.md "$(recorded ARCHITECTURE.md)"; do
    [ -f "$root/$doc" ] || continue
    case $doc in
      "$map" | "$(recorded docs/ui/screens.md)") level=FAIL ;;
      *) level=WARN ;;
    esac
    code_spans "$root/$doc" | sort -u | while IFS= read -r span; do
      p=$(repo_path "$span") || continue
      p=${p%/}
      [ -e "$root/$p" ] && continue
      # The old code map place already has its own warning.
      [ "$p" = docs/code-map.md ] && [ "$map" = .agents/code-map.md ] && continue
      if printf '%s\n' "$known" | grep -q -- "/$p\$"; then continue; fi
      finding "$level" path "$doc cites $p, which does not exist"
    done
  done
}

# Each folder directly under a source root (src, lib, app, apps, packages,
# crates, at the top or one level down) is named in the code map as a path:
# `<root>/<name>` or `<name>/`. A bare word does not count: "the map" in prose
# is not an entry for src/map.
check_code_map_coverage() {
  map_rel=$(code_map_file)
  map="$root/$map_rel"
  [ -f "$map" ] || return 0
  for base in "$root"/src "$root"/lib "$root"/app "$root"/apps "$root"/packages "$root"/crates "$root"/*/src; do
    [ -d "$base" ] || continue
    for d in "$base"/*/; do
      [ -d "$d" ] || continue
      name=${d%/}
      name=${name##*/}
      parent=${base##*/}
      case $name in node_modules | target | dist | build | __pycache__ | .*) continue ;; esac
      rel=${d#"$root"/}
      rel=${rel%/}
      if command -v git >/dev/null 2>&1 && git -C "$root" check-ignore -q -- "$rel" 2>/dev/null; then continue; fi
      if ! grep -Eq "(^|[^A-Za-z0-9_.-])$name/|$parent/$name([^A-Za-z0-9_-]|\$)" "$map"; then
        finding WARN code-map "$rel is not named in $map_rel"
      fi
    done
  done
}

# Too many commits since the last garden pass (or since the stage was set,
# before the first pass) means drift is piling up unread.
GARDEN_WARN=50
check_garden() {
  [ "$stage" != explore ] || return 0
  command -v git >/dev/null 2>&1 || return 0
  git -C "$root" rev-parse -q --verify HEAD >/dev/null 2>&1 || return 0
  last=$(state_value garden_last)
  if [ -n "$last" ] && [ "$last" != null ] && git -C "$root" rev-parse -q --verify "$last^{commit}" >/dev/null 2>&1; then
    n=$(git -C "$root" rev-list --count "$last..HEAD")
    since="the last garden pass ($(printf '%.7s' "$last"))"
  else
    set_on=$(state_value stage_set)
    [ -n "$set_on" ] || return 0
    n=$(git -C "$root" rev-list --count --since="$set_on" HEAD)
    since="the stage was set ($set_on), with no garden pass yet"
  fi
  if [ "$n" -gt "$GARDEN_WARN" ]; then
    finding WARN garden "$n commits since $since; run foundry garden"
  fi
}

run_checks() {
  check_required
  check_paths
  check_code_map_coverage
  check_garden
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
