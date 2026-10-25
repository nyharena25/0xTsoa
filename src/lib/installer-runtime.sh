# ==============================================================================
# 0xTsoa installer runtime. Identical in every generated install.sh; only the
# OXT_* values and the oxt_steps function above come from the reviewed config.
# Parts a setup does not use (cloning, copying, upstream installers) stay idle.
#
# Guarantees (tested in tests/installer-runtime.test.ts):
#   --dry-run writes nothing, installs nothing and never calls sudo.
#   Existing files that differ are kept unless you approve (or pass --force).
#   Every file in your home folder is backed up and verified before it changes.
#   --rollback restores those files; packages and sudo changes are not undone,
#   but it lists the packages this install added and the command to remove them.
#   A package that fails to install makes the script exit with an error.
# ==============================================================================
# OXT_SLUG, OXT_NAME, OXT_REPO, OXT_REF, OXT_PINNED and OXT_COMMON are set by the generated header.
# shellcheck disable=SC2153

OXT_MODE=install
OXT_PHASE=plan
OXT_FORCE=0
OXT_YES="${OXTSOA_YES:-0}"
OXT_WARNED=0
OXT_FAILED=0
OXT_N=0
OXT_SEEN=$'\n'
OXT_BACKUP=''
OXT_MANIFEST=''
OXT_DONE=0
OXT_C_NEW=0
OXT_C_CONFLICT=0
OXT_C_BLOCK=0
OXT_C_SYSTEM=0
OXT_C_UPSTREAM=0
OXT_C_EXEC=0
OXT_C_PKG=0
OXT_C_FILES=0
OXT_C_UNAVAILABLE=0
OXT_KEPT=''
OXT_NEW=()
OXT_RM=''
OXT_ROLLBACK_CMD='bash install.sh'

# OXT_COMMON (set by the generated header): folders an upstream installer usually
# rewrites, backed up just before one runs.

note() {
  if [ "$OXT_PHASE" = plan ]; then oxt_say '[manual]' "$*"; else printf '  -> %s\n' "$*"; fi
}
warn() { printf '  !! %s\n' "$*" >&2; OXT_WARNED=1; }
# A step that did not do its job: the run goes on, but the script exits with an error.
fail() { warn "$*"; OXT_FAILED=1; }
die() { printf '  xx %s\n' "$*" >&2; exit 1; }
oxt_say() { printf '  %-11s %s\n' "$1" "${2//"$HOME/"/"~/"}"; }
step() { printf '\n[%s/%s] %s\n' "$1" "$2" "$3"; }

oxt_usage() {
  cat <<'EOF'
Usage: bash install.sh [--dry-run] [--force] [--yes] [--rollback] [--help]

  (no option)  Show the plan, ask, back up what will change, then install.
               Existing files that differ are kept; you are asked about each one.
  --dry-run    Show the plan only. Writes nothing, installs nothing, never uses sudo.
  --force      Replace conflicting files and folders (each is backed up first).
  --yes        Never ask. Conflicting files are still kept unless --force is given.
  --rollback   Restore the files changed by the last install of this setup.
  --help       Show this help.

Environment: OXTSOA_YES=1 (same as --yes), OXTSOA_DIR (download cache,
default ~/.cache/0xtsoa), XDG_STATE_HOME (backups in $XDG_STATE_HOME/0xtsoa,
default ~/.local/state/0xtsoa).
EOF
}

# --- Paths --------------------------------------------------------------------
# oxt_abs sets OXT_P to an absolute path without a trailing slash.
oxt_abs() {
  case "$1" in
    /*) OXT_P="$1" ;;
    *) OXT_P="$PWD/$1" ;;
  esac
  [ "$OXT_P" = / ] || OXT_P="${OXT_P%/}"
}

# True when OXT_P is strictly inside $HOME, with no ".." or "." segments.
oxt_in_home() {
  case "$OXT_P" in "$HOME"/*) ;; *) return 1 ;; esac
  case "$OXT_P/" in */../* | */./*) return 1 ;; esac
  [ "$OXT_P" != "$HOME" ]
}

oxt_in_workdir() {
  case "$OXT_P" in "$OXT_WORKDIR" | "$OXT_WORKDIR"/*) return 0 ;; esac
  return 1
}

oxt_exists() { [ -e "$1" ] || [ -L "$1" ]; }

# Delete a path, only ever inside $HOME (used for --force and rollback).
oxt_remove() {
  oxt_abs "$1"
  oxt_in_home || die "Refusing to delete $OXT_P: it is outside your home folder."
  command rm -rf -- "$OXT_P"
}

# --- Backups ------------------------------------------------------------------
# Back up $1 once per run, before anything modifies it. The copy is verified;
# if that fails the script stops before the change is made.
oxt_backup() {
  oxt_abs "$1"
  oxt_in_workdir && return 0
  case "$OXT_SEEN" in *$'\n'"$OXT_P"$'\n'*) return 0 ;; esac
  case "$OXT_P" in *$'\t'* | *$'\n'*) die "Unsupported path (tab or newline): $OXT_P" ;; esac
  if ! oxt_in_home; then
    warn "$OXT_P is outside your home folder: not backed up, not covered by --rollback."
    return 0
  fi
  OXT_SEEN+="$OXT_P"$'\n'
  if oxt_exists "$OXT_P"; then
    ((OXT_N += 1))
    command cp -a -- "$OXT_P" "$OXT_BACKUP/files/$OXT_N" ||
      die "Backup of $OXT_P failed. Stopped before changing it."
    diff -r --no-dereference -- "$OXT_P" "$OXT_BACKUP/files/$OXT_N" >/dev/null 2>&1 ||
      die "Backup of $OXT_P could not be verified. Stopped before changing it."
    printf 'existed\t%s\tfiles/%s\n' "$OXT_P" "$OXT_N" >>"$OXT_MANIFEST"
  else
    printf 'created\t%s\t-\n' "$OXT_P" >>"$OXT_MANIFEST"
  fi
}

oxt_record() { printf '%s\t%s\t-\n' "$1" "$2" >>"$OXT_MANIFEST"; }

# --- Distro & packages --------------------------------------------------------
OXT_DISTRO=unknown
# shellcheck disable=SC2034 # read by oxt_distro_check when the config lists distros
OXT_DISTRO_LIKE=''
oxt_os() {
  local ID='' ID_LIKE=''
  # shellcheck disable=SC1091
  . /etc/os-release
  OXT_DISTRO="${ID:-unknown}"
  # shellcheck disable=SC2034
  OXT_DISTRO_LIKE="${ID_LIKE:-}"
}
if [ -r /etc/os-release ]; then oxt_os; fi
OXT_PM=none
for oxt_pm in pacman apt-get dnf zypper xbps-install apk emerge nix-env; do
  if command -v "$oxt_pm" >/dev/null 2>&1; then OXT_PM="$oxt_pm"; break; fi
done
OXT_SUDO=''
for oxt_su in sudo doas; do
  if command -v "$oxt_su" >/dev/null 2>&1; then OXT_SUDO="$oxt_su"; break; fi
done

# True when package $1 is already installed (read-only query, no sudo). Unknown package
# managers answer "no", so every package is treated as new there.
oxt_pkg_installed() {
  case "$OXT_PM" in
    pacman) pacman -Q -- "$1" >/dev/null 2>&1 ;;
    apt-get) dpkg -s "$1" 2>/dev/null | grep -q '^Status: install ok installed' ;;
    dnf | zypper) rpm -q -- "$1" >/dev/null 2>&1 ;;
    xbps-install) xbps-query -- "$1" >/dev/null 2>&1 ;;
    apk) apk info -e -- "$1" >/dev/null 2>&1 ;;
    *) return 1 ;;
  esac
}

# Sets OXT_RM to the command that removes packages "$@" again, for the rollback summary.
oxt_pkg_remove_cmd() {
  local su="${OXT_SUDO:-sudo}"
  case "$OXT_PM" in
    pacman) OXT_RM="$su pacman -Rns $*" ;;
    apt-get) OXT_RM="$su apt-get remove $*" ;;
    dnf) OXT_RM="$su dnf remove $*" ;;
    zypper) OXT_RM="$su zypper remove $*" ;;
    xbps-install) OXT_RM="$su xbps-remove -R $*" ;;
    apk) OXT_RM="$su apk del $*" ;;
    emerge) OXT_RM="$su emerge --deselect $* && $su emerge --depclean" ;;
    *) OXT_RM="the remove command of your package manager, for: $*" ;;
  esac
}

# Sets OXT_NEW to the packages among "$@" that are not installed yet.
oxt_new_packages() {
  local p
  OXT_NEW=()
  for p in "$@"; do oxt_pkg_installed "$p" || OXT_NEW+=("$p"); done
}

pkg_install() {
  oxt_new_packages "$@"
  if [ "$OXT_PHASE" = plan ]; then
    if [ "$OXT_PM" = nix-env ]; then
      oxt_say '[manual]' "NixOS: add $* to environment.systemPackages, then run nixos-rebuild switch"
    elif [ "${#OXT_NEW[@]}" -eq 0 ]; then
      oxt_say '[same]' "$* (already installed)"
    elif [ "$OXT_PM" = none ] || [ -z "$OXT_SUDO" ]; then
      oxt_say '[missing]' "${OXT_NEW[*]} (needs a supported package manager and sudo or doas)"
      ((OXT_C_UNAVAILABLE += 1))
    else
      oxt_say '[package]' "${OXT_NEW[*]} (with $OXT_PM, uses $OXT_SUDO)"
      ((OXT_C_PKG += ${#OXT_NEW[@]}))
    fi
    return 0
  fi
  if [ "$OXT_PM" = nix-env ]; then
    warn "NixOS: add to environment.systemPackages, then nixos-rebuild switch: $*"
    return 0
  fi
  if [ "${#OXT_NEW[@]}" -eq 0 ]; then
    note "already installed: $*"
    return 0
  fi
  if [ "$OXT_PM" = none ] || [ -z "$OXT_SUDO" ]; then
    fail "Not installed: ${OXT_NEW[*]} (no supported package manager, or no sudo/doas). See $OXT_REPO"
    return 0
  fi
  oxt_record packages "${OXT_NEW[*]}"
  local ok=1
  case "$OXT_PM" in
    pacman) "$OXT_SUDO" pacman -S --needed "${OXT_NEW[@]}" || ok=0 ;;
    apt-get) "$OXT_SUDO" apt-get install -y "${OXT_NEW[@]}" || ok=0 ;;
    dnf) "$OXT_SUDO" dnf install -y "${OXT_NEW[@]}" || ok=0 ;;
    zypper) "$OXT_SUDO" zypper install -y "${OXT_NEW[@]}" || ok=0 ;;
    xbps-install) "$OXT_SUDO" xbps-install -y "${OXT_NEW[@]}" || ok=0 ;;
    apk) "$OXT_SUDO" apk add "${OXT_NEW[@]}" || ok=0 ;;
    emerge) "$OXT_SUDO" emerge --noreplace "${OXT_NEW[@]}" || ok=0 ;;
  esac
  if [ "$ok" = 0 ]; then fail "Could not install: ${OXT_NEW[*]} (names can differ on $OXT_DISTRO). See $OXT_REPO"; fi
  return 0
}

aur_install() {
  local helper
  oxt_new_packages "$@"
  if [ "$OXT_PHASE" = plan ]; then
    if [ "${#OXT_NEW[@]}" -eq 0 ]; then
      oxt_say '[same]' "$* (already installed)"
    elif [ "$OXT_PM" != pacman ]; then
      oxt_say '[missing]' "${OXT_NEW[*]} (Arch AUR packages, not available on $OXT_DISTRO)"
      ((OXT_C_UNAVAILABLE += 1))
    else
      oxt_say '[package]' "${OXT_NEW[*]} (Arch AUR; needs yay or paru)"
      ((OXT_C_PKG += ${#OXT_NEW[@]}))
    fi
    return 0
  fi
  if [ "${#OXT_NEW[@]}" -eq 0 ]; then
    note "already installed: $*"
    return 0
  fi
  for helper in yay paru; do
    if command -v "$helper" >/dev/null 2>&1; then
      oxt_record packages "${OXT_NEW[*]}"
      "$helper" -S --needed "${OXT_NEW[@]}" || fail "AUR install failed: ${OXT_NEW[*]}"
      return 0
    fi
  done
  if [ "$OXT_PM" = pacman ]; then
    fail "${OXT_NEW[*]} is in the AUR: install yay or paru, then rerun this script."
  else
    fail "${OXT_NEW[*]} is an Arch (AUR) package with no $OXT_DISTRO equivalent here. Install it from $OXT_REPO"
  fi
  return 0
}

# --- Actions (each one plans in the plan phase, acts in the run phase) --------
# A config command run as written. Its effects are not backed up or undone.
oxt_exec() {
  if [ "$OXT_PHASE" = plan ]; then
    oxt_say '[run]' "$1"
    ((OXT_C_EXEC += 1))
    return 0
  fi
  printf '  $ %s\n' "$1"
  eval "$1"
}

# Ask the running session (compositor, window manager, KWin) to reload. Installs often run
# from a TTY or another desktop, where there is nothing to reload: that is not a failure.
oxt_reload() {
  if [ "$OXT_PHASE" = plan ]; then
    oxt_say '[reload]' "$1  (only if that session is running now)"
    return 0
  fi
  printf '  $ %s\n' "$1"
  if ! eval "$1" >/dev/null 2>&1; then
    note "No running session answered. Log in to it, or reload it yourself, to see the changes."
  fi
  return 0
}

# A sudo command writing outside your home folder: not covered by --rollback.
oxt_system() {
  if [ "$OXT_PHASE" = plan ]; then
    oxt_say '[system]' "$1  (uses sudo, not undone by --rollback)"
    ((OXT_C_SYSTEM += 1))
    return 0
  fi
  printf '  $ %s\n' "$1"
  oxt_record system "$1"
  eval "$1"
}

# An upstream installer script: it decides what it touches, so the usual
# desktop config folders are backed up right before it runs.
oxt_upstream() {
  local d
  if [ "$OXT_PHASE" = plan ]; then
    oxt_say '[upstream]' "$1"
    oxt_say '' "  The upstream installer manages its own files. Before it runs, these are backed up:"
    for d in "${OXT_COMMON[@]}"; do
      if oxt_exists "$HOME/$d"; then oxt_say '' "  ~/$d"; fi
    done
    ((OXT_C_UPSTREAM += 1))
    return 0
  fi
  for d in "${OXT_COMMON[@]}"; do oxt_backup "$HOME/$d"; done
  case "$1" in sudo*) oxt_record system "$1" ;; esac
  printf '  $ %s\n' "$1"
  eval "$1"
}

oxt_same_repo() {
  local a="${1%/}" b="${2%/}"
  a="${a%.git}"
  b="${b%.git}"
  [ "${a,,}" = "${b,,}" ]
}

# git clone with a conflict check: an existing clone of the same repository is
# updated; anything else at the destination stops the install unless --force.
oxt_clone() {
  local a url='' dest='' target state origin=''
  for a in "$@"; do
    case "$a" in
      -*) ;;
      *) if [ -z "$url" ]; then url="$a"; else dest="$a"; fi ;;
    esac
  done
  if [ -z "$dest" ]; then
    dest="${url##*/}"
    dest="${dest%.git}"
  fi
  if [ "$OXT_PHASE" = plan ] && [ "${dest#/}" = "$dest" ]; then
    oxt_say '[download]' "$url (into the download cache)"
    return 0
  fi
  oxt_abs "$dest"
  target="$OXT_P"
  state=new
  if [ -d "$target/.git" ]; then
    { read -r origin < <(command git -C "$target" remote get-url origin 2>/dev/null); } || true
    if oxt_same_repo "$origin" "$url"; then state=same; else state=conflict; fi
  elif oxt_exists "$target"; then
    state=conflict
  fi

  if [ "$OXT_PHASE" = plan ]; then
    case "$state" in
      new) oxt_say '[new]' "$target (clone of $url)"; ((OXT_C_NEW += 1)) ;;
      same)
        oxt_say '[update]' "$target (already a clone of $url; backed up, then updated)"
        ((OXT_C_FILES += 1))
        ;;
      conflict)
        oxt_say '[conflict]' "$target exists and is not a clone of $url"
        ((OXT_C_BLOCK += 1))
        ;;
    esac
    return 0
  fi

  case "$state" in
    new)
      oxt_backup "$target"
      command git clone "$@"
      ;;
    same)
      oxt_backup "$target"
      note "$target is already cloned, fetching updates"
      command git -C "$target" fetch --quiet origin
      ;;
    conflict)
      [ "$OXT_FORCE" = 1 ] || die "$target exists and is not a clone of $url. Move it away, or rerun with --force (it is backed up first)."
      oxt_backup "$target"
      oxt_remove "$target"
      command git clone "$@"
      ;;
  esac
}

# Ask what to do with a conflicting file; sets OXT_REPLY to keep or replace.
oxt_ask_conflict() {
  local ans
  OXT_REPLY=keep
  if [ "$OXT_FORCE" = 1 ]; then OXT_REPLY=replace; return 0; fi
  [ "$OXT_YES" = 1 ] && return 0
  while :; do
    printf '  ?? %s already exists and differs. [k]eep yours (default), [r]eplace (backed up first), [d]iff: ' "$1"
    ans=''
    { read -r ans </dev/tty; } 2>/dev/null || return 0
    case "$ans" in
      r | R) OXT_REPLY=replace; return 0 ;;
      d | D) diff -ru --no-dereference -- "$1" "$2" | head -n 200 || true ;;
      *) return 0 ;;
    esac
  done
}

# cp with the same target rules as cp, plus: new targets are recorded, identical ones
# skipped, and differing ones kept unless you approve the replacement.
oxt_copy() {
  local -a flags=() srcs=()
  local a dest s t name state
  for a in "$@"; do
    case "$a" in
      -*) flags+=("$a") ;;
      *) srcs+=("$a") ;;
    esac
  done
  dest="${srcs[-1]}"
  unset 'srcs[-1]'
  for s in "${srcs[@]}"; do
    if [ "$OXT_PHASE" = plan ] && [ "${s#/}" = "$s" ]; then
      oxt_say '[copy]' "$s -> $dest (from the download, checked at install time)"
      continue
    fi
    if ! oxt_exists "$s"; then
      if [ "$OXT_PHASE" = plan ]; then
        oxt_say '[copy]' "$s -> $dest (checked at install time, once a package or download provides it)"
        continue
      fi
      # A system file (/etc/..., /usr/share/...) comes from a package whose layout differs between
      # distros: report it and go on. A file from the pinned download is checked by CI, so its
      # absence means something is wrong: stop.
      oxt_abs "$s"
      if ! oxt_in_home && ! oxt_in_workdir; then
        fail "Not copied: $s does not exist on $OXT_DISTRO. Copy a starting config to $dest yourself (see $OXT_REPO)."
        continue
      fi
      die "Source not found: $s"
    fi
    name="${s%/}"
    name="${name##*/}"
    if [ -d "$dest" ] || [ "${dest%/}" != "$dest" ]; then t="${dest%/}/$name"; else t="$dest"; fi
    oxt_abs "$t"
    t="$OXT_P"
    if ! oxt_exists "$t"; then
      state=new
    elif diff -r --no-dereference -- "$s" "$t" >/dev/null 2>&1; then
      state=same
    else
      state=conflict
    fi

    if [ "$OXT_PHASE" = plan ]; then
      case "$state" in
        new) oxt_say '[new]' "$t"; ((OXT_C_NEW += 1)) ;;
        same) oxt_say '[same]' "$t (identical, skipped)" ;;
        conflict)
          oxt_say '[conflict]' "$t differs: kept unless you choose to replace it"
          ((OXT_C_CONFLICT += 1))
          ;;
      esac
      continue
    fi

    case "$state" in
      same) note "unchanged: $t" ;;
      new)
        oxt_backup "$t"
        command cp "${flags[@]}" -- "$s" "$dest"
        ;;
      conflict)
        oxt_ask_conflict "$t" "$s"
        if [ "$OXT_REPLY" = replace ]; then
          oxt_backup "$t"
          command cp "${flags[@]}" -- "$s" "$dest"
        else
          warn "Kept your $t. To use the version from this setup: rerun with --force (backed up first)."
          OXT_KEPT+="  $t"$'\n'
        fi
        ;;
    esac
  done
}

# Append a config line once; the file is backed up before the first change.
oxt_append() {
  local line="$1" file="$2"
  if grep -qxF -- "$line" "$file" 2>/dev/null; then
    if [ "$OXT_PHASE" = plan ]; then oxt_say '[same]' "$file already contains: $line"; fi
    return 0
  fi
  if [ "$OXT_PHASE" = plan ]; then
    oxt_say '[append]' "$file += $line"
    ((OXT_C_FILES += 1))
    return 0
  fi
  oxt_backup "$file"
  printf '%s\n' "$line" >>"$file"
}

# --- Confirmation, run setup, rollback ----------------------------------------
oxt_confirm() {
  local ans=''
  [ "$OXT_YES" = 1 ] && return 0
  printf '%s [y/N] ' "$1"
  { read -r ans </dev/tty; } 2>/dev/null ||
    die "No terminal to ask on. Rerun with --yes to accept (conflicting files are still kept). $2"
  case "$ans" in y | Y | yes | YES) return 0 ;; esac
  die "Cancelled. $2"
}

oxt_on_exit() {
  local rc="$1"
  [ "$OXT_PHASE" = run ] || return 0
  [ "$OXT_DONE" = 1 ] && return 0
  [ "$rc" = 0 ] && return 0
  if grep -q -E '^(existed|created)'$'\t' "$OXT_MANIFEST" 2>/dev/null; then
    printf '\n  xx Stopped (exit %s). Files changed so far are backed up in:\n     %s\n' "$rc" "$OXT_BACKUP" >&2
    printf '     Restore them with: %s --rollback\n' "$OXT_ROLLBACK_CMD" >&2
  else
    printf '\n  xx Stopped (exit %s). No file in your home folder was changed.\n' "$rc" >&2
  fi
}

oxt_begin_run() {
  local base n=0
  printf -v OXT_TS '%(%Y%m%d-%H%M%S)T' -1
  mkdir -p -- "$OXT_BACKUPS" 2>/dev/null || die "Cannot create $OXT_BACKUPS. Nothing was changed."
  base="$OXT_BACKUPS/$OXT_TS"
  OXT_BACKUP="$base"
  until mkdir -- "$OXT_BACKUP" 2>/dev/null; do
    ((n += 1))
    [ "$n" -lt 50 ] || die "Cannot create a backup folder in $OXT_BACKUPS. Nothing was changed."
    OXT_BACKUP="$base-$n"
  done
  mkdir -- "$OXT_BACKUP/files" || die "Cannot write to $OXT_BACKUP. Nothing was changed."
  OXT_MANIFEST="$OXT_BACKUP/manifest.tsv"
  : >"$OXT_MANIFEST" || die "Cannot write to $OXT_BACKUP. Nothing was changed."
  if [ -f "${BASH_SOURCE[0]}" ]; then
    command cp -- "${BASH_SOURCE[0]}" "$OXT_BACKUP/install.sh" && OXT_ROLLBACK_CMD="bash '$OXT_BACKUP/install.sh'"
  fi
  OXT_PHASE=run
  trap 'oxt_on_exit $?' EXIT
  mkdir -p -- "$OXT_WORKDIR"
  cd -- "$OXT_WORKDIR" || die "Cannot enter $OXT_WORKDIR."
}

oxt_rollback() {
  local d latest='' kind p ref i
  local -a kinds=() paths=() refs=()
  for d in "$OXT_BACKUPS"/*/; do
    if [ -f "${d}manifest.tsv" ]; then latest="${d%/}"; fi
  done
  [ -n "$latest" ] || die "No backup to restore for this setup in $OXT_BACKUPS."
  while IFS=$'\t' read -r kind p ref; do
    kinds+=("$kind")
    paths+=("$p")
    refs+=("$ref")
  done <"$latest/manifest.tsv"

  printf 'Rollback from %s:\n' "$latest"
  for i in "${!kinds[@]}"; do
    case "${kinds[i]}" in
      existed) oxt_say '[restore]' "${paths[i]}" ;;
      created) if oxt_exists "${paths[i]}"; then oxt_say '[remove]' "${paths[i]}  (moved aside, not deleted)"; fi ;;
      packages)
        oxt_pkg_remove_cmd "${paths[i]}"
        oxt_say '[kept]' "packages added by this install: ${paths[i]}. Remove them with: $OXT_RM"
        ;;
      system) oxt_say '[kept]' "${paths[i]} (sudo change, not undone)" ;;
    esac
  done
  oxt_confirm 'Restore these files?' 'Nothing was changed.'

  # The current version of every path is moved to undone/ first, so a rollback can itself be undone.
  mkdir -p -- "$latest/undone" || die "Cannot write to $latest. Nothing was changed."
  for ((i = ${#kinds[@]} - 1; i >= 0; i--)); do
    OXT_P="${paths[i]}"
    case "${kinds[i]}" in
      existed | created) ;;
      *) continue ;;
    esac
    if ! oxt_in_home; then
      warn "Skipped $OXT_P: outside your home folder."
      continue
    fi
    if [ "${kinds[i]}" = existed ] && ! oxt_exists "$latest/${refs[i]}"; then
      warn "Backup copy missing for $OXT_P, left as is."
      continue
    fi
    if oxt_exists "$OXT_P"; then
      mv -- "$OXT_P" "$latest/undone/$i" || die "Cannot move $OXT_P aside; stopped. Already restored paths stay restored."
      printf '%s\t%s\n' "$OXT_P" "undone/$i" >>"$latest/undone.tsv"
    fi
    if [ "${kinds[i]}" = existed ]; then
      mkdir -p -- "${OXT_P%/*}"
      command cp -a -- "$latest/${refs[i]}" "$OXT_P"
    fi
  done
  mv -- "$latest/manifest.tsv" "$latest/manifest.restored.tsv"
  printf '\nRestored. What was there before the rollback is kept in %s/undone (see undone.tsv).\n' "$latest"
  printf 'Run --rollback again to go back one more install.\n'
}
# One line counting what the plan will do; only the kinds that occur are listed.
oxt_summary() {
  local -a parts=()
  [ "$OXT_C_NEW" = 0 ] || parts+=("$OXT_C_NEW new")
  [ "$OXT_C_FILES" = 0 ] || parts+=("$OXT_C_FILES updated")
  [ "$OXT_C_CONFLICT" = 0 ] || parts+=("$OXT_C_CONFLICT conflicting (kept unless replaced)")
  [ "$OXT_C_BLOCK" = 0 ] || parts+=("$OXT_C_BLOCK blocking")
  [ "$OXT_C_PKG" = 0 ] || parts+=("$OXT_C_PKG package(s) to install")
  [ "$OXT_C_UNAVAILABLE" = 0 ] || parts+=("$OXT_C_UNAVAILABLE package step(s) that cannot run here")
  [ "$OXT_C_SYSTEM" = 0 ] || parts+=("$OXT_C_SYSTEM other sudo change(s)")
  [ "$OXT_C_UPSTREAM" = 0 ] || parts+=("$OXT_C_UPSTREAM upstream installer(s)")
  [ "$OXT_C_EXEC" = 0 ] || parts+=("$OXT_C_EXEC command(s) to run")
  local out='' p
  for p in "${parts[@]}"; do out+="${out:+, }$p"; done
  printf '\nSummary: %s.\n' "${out:-nothing to change}"
}

oxt_main() {
  local a
  for a in "$@"; do
    case "$a" in
      --dry-run | -n) OXT_MODE=plan ;;
      --force) OXT_FORCE=1 ;;
      --yes | -y) OXT_YES=1 ;;
      --rollback) OXT_MODE=rollback ;;
      -h | --help) oxt_usage; exit 0 ;;
      *) printf 'Unknown option: %s\n\n' "$a" >&2; oxt_usage >&2; exit 2 ;;
    esac
  done
  # Under sudo, files land in /root or end up owned by root and break the desktop.
  [ "$EUID" -ne 0 ] || die "Run as your normal user, not with sudo or as root. It asks for sudo itself where a step needs it. Nothing was changed."
  HOME="${HOME%/}"
  if [ -z "$HOME" ] || [ ! -d "$HOME" ]; then die "HOME is not set to a folder."; fi
  OXT_WORKDIR="${OXTSOA_DIR:-$HOME/.cache/0xtsoa}/$OXT_SLUG"
  OXT_BACKUPS="${XDG_STATE_HOME:-$HOME/.local/state}/0xtsoa/backups/$OXT_SLUG"

  printf '%s\n' '======================================================================'
  printf ' [0xTSOA] %s\n' "$OXT_NAME"
  if [ "$OXT_PINNED" = 1 ]; then
    printf ' Source:   %s @ %s\n' "$OXT_REPO" "$OXT_REF"
  else
    printf ' Source:   %s (reference only: this script does not download it at a pinned version)\n' "$OXT_REPO"
  fi
  printf ' Detected: %s (package manager: %s)\n' "$OXT_DISTRO" "$OXT_PM"
  printf '%s\n' '======================================================================'

  if [ "$OXT_MODE" = rollback ]; then
    oxt_rollback
    return 0
  fi

  oxt_distro_check
  printf '\nPlan (nothing has been changed yet):\n'
  oxt_steps
  oxt_summary
  if ((OXT_C_NEW + OXT_C_CONFLICT + OXT_C_UPSTREAM + OXT_C_FILES > 0)); then
    printf 'Files marked [new], [update], [append], [conflict] and folders backed up for [upstream] are\n'
    printf 'backed up to %s/<date> and restored by --rollback.\n' "$OXT_BACKUPS"
  fi
  if [ "$OXT_C_PKG" -gt 0 ]; then
    printf 'Packages stay installed after --rollback, which lists the command to remove them.\n'
  fi
  if [ "$OXT_C_EXEC" -gt 0 ] || [ "$OXT_C_SYSTEM" -gt 0 ]; then
    printf 'The effects of [run] and [system] commands are not undone by --rollback.\n'
  fi

  if [ "$OXT_MODE" = plan ]; then
    printf '\nDry run: nothing was changed.\n'
    return 0
  fi
  if [ "$OXT_C_BLOCK" -gt 0 ] && [ "$OXT_FORCE" != 1 ]; then
    die "Some destinations already exist and belong to something else (see [conflict] above). Nothing was changed. Move them away, or rerun with --force to back them up and replace them."
  fi
  if [ "$OXT_C_UNAVAILABLE" -gt 0 ] && [ "$OXT_FORCE" != 1 ]; then
    die "Some packages cannot be installed here (see [missing] above). Nothing was changed. Install them as $OXT_REPO explains, or rerun with --force to install the rest anyway."
  fi
  oxt_confirm 'Apply this plan?' 'Nothing was changed.'

  oxt_begin_run
  oxt_steps
  OXT_DONE=1

  printf '\n%s\n' '======================================================================'
  if [ -n "$OXT_KEPT" ]; then printf ' Kept your versions of:\n%s' "$OXT_KEPT"; fi
  if [ "$OXT_FAILED" = 1 ]; then
    printf ' [0xTSOA] Finished, but some steps failed (see !! lines above).\n'
  elif [ "$OXT_WARNED" = 1 ]; then
    printf ' [0xTSOA] Done with warnings (see !! lines above).\n'
  else
    printf ' [0xTSOA] Installation completed.\n'
  fi
  printf ' Backup: %s\n Undo:   %s --rollback\n' "$OXT_BACKUP" "$OXT_ROLLBACK_CMD"
  printf '%s\n' '======================================================================'
  [ "$OXT_FAILED" = 0 ] || exit 1
}
