// Copyright (C) 2024-2026 Plabayo
// License: https://github.com/plabayo/homework/blob/main/LICENSE
// Source-available; non-commercial use only.

import assert from "node:assert";
import { test } from "node:test";

import { createScreenWakeLockController } from "./history-harness.mjs";

function fakeSentinel() {
    let onRelease = null;
    return {
        released: false,
        addEventListener(type, handler) {
            if (type === "release") onRelease = handler;
        },
        async release() {
            if (this.released) return;
            this.released = true;
            onRelease?.();
        },
    };
}

test("wake lock follows the active exercise and page visibility", async () => {
    let visibility = "visible";
    const sentinels = [];
    const requestedTypes = [];
    const controller = createScreenWakeLockController({
        getVisibilityState: () => visibility,
        getWakeLock: () => ({
            async request(type) {
                requestedTypes.push(type);
                const sentinel = fakeSentinel();
                sentinels.push(sentinel);
                return sentinel;
            },
        }),
    });

    await controller.start();
    assert.deepEqual(requestedTypes, ["screen"]);
    assert.equal(sentinels[0].released, false);

    visibility = "hidden";
    await controller.visibilityChanged();
    assert.equal(sentinels[0].released, true);

    visibility = "visible";
    await controller.visibilityChanged();
    assert.deepEqual(requestedTypes, ["screen", "screen"]);
    assert.equal(sentinels[1].released, false);

    await controller.stop();
    assert.equal(sentinels[1].released, true);
});

test("wake lock degrades silently when unsupported or denied", async () => {
    const unsupported = createScreenWakeLockController({
        getWakeLock: () => undefined,
        getVisibilityState: () => "visible",
    });
    await unsupported.start();
    await unsupported.stop();

    const denied = createScreenWakeLockController({
        getWakeLock: () => ({ request: () => Promise.reject(new Error("denied")) }),
        getVisibilityState: () => "visible",
    });
    await denied.start();
    await denied.stop();
});

test("a wake lock granted after the exercise ends is released immediately", async () => {
    let resolveRequest;
    const sentinel = fakeSentinel();
    const controller = createScreenWakeLockController({
        getWakeLock: () => ({
            request: () =>
                new Promise((resolve) => {
                    resolveRequest = resolve;
                }),
        }),
        getVisibilityState: () => "visible",
    });

    const starting = controller.start();
    await controller.stop();
    resolveRequest(sentinel);
    await starting;

    assert.equal(sentinel.released, true);
});
