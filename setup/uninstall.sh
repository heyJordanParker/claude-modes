#!/bin/sh
set -e
command -v claude-modes >/dev/null 2>&1 || exit 0
claude-modes unbind
