#!/usr/bin/env bash
# Stops the demo's containers.
docker rm -f mz-sdk-demo pg-sdk-demo 2>/dev/null || true
