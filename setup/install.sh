#!/bin/sh
set -e
echo 'progress 0 1 Binding shift+tab to /mode'
claude-modes bind
echo 'progress 1 1 Bound shift+tab to /mode'
