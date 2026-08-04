/**
 * The four independent gates.
 *
 * The point of these tests is NOT that each gate can be switched off — that is
 * trivially true. It is that switching one ON opens nothing else. A partial
 * rollout is only survivable if the gates are genuinely orthogonal, and the way
 * that breaks in practice is someone deriving one from another for convenience.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  gateMatrix,
  isBackendEvaluationEnabled,
  isCanaryAccessEnabled,
  isProductionDeployment,
  isPublicIntakeEnabled,
  isReviewHandoffEnabled,
} from '../../lib/offerr/preview-config.ts';

const GATE_VARS = [
  'OFFERR_PUBLIC_INTAKE_ENABLED',
  'OFFERR_BACKEND_EVALUATION_ENABLED',
  'OFFERR_CANARY_ACCESS_ENABLED',
  'OFFERR_REVIEW_HANDOFF_ENABLED',
] as const;

/** Run `fn` with an exact environment, restoring whatever was there before. */
function withEnv(env: Record<string, string | undefined>, fn: () => void) {
  const saved: Record<string, string | undefined> = {};
  const keys = [...GATE_VARS, 'VERCEL_ENV', 'NODE_ENV'];
  for (const key of keys) saved[key] = process.env[key];
  try {
    for (const key of keys) delete process.env[key];
    for (const [key, value] of Object.entries(env)) {
      if (value !== undefined) process.env[key] = value;
    }
    fn();
  } finally {
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}

/** A non-production deployment, so the production hard-off is not what is being tested. */
const PREVIEW = { VERCEL_ENV: 'preview' };

test('every gate defaults to false when unset', () => {
  withEnv(PREVIEW, () => {
    assert.deepEqual(gateMatrix(), {
      publicIntake: false,
      backendEvaluation: false,
      canaryAccess: false,
      reviewHandoff: false,
    });
  });
});

test('turning ONE gate on opens no other gate', () => {
  const readers = {
    OFFERR_PUBLIC_INTAKE_ENABLED: 'publicIntake',
    OFFERR_BACKEND_EVALUATION_ENABLED: 'backendEvaluation',
    OFFERR_CANARY_ACCESS_ENABLED: 'canaryAccess',
    OFFERR_REVIEW_HANDOFF_ENABLED: 'reviewHandoff',
  } as const;

  for (const [variable, own] of Object.entries(readers)) {
    withEnv({ ...PREVIEW, [variable]: 'true' }, () => {
      const matrix = gateMatrix() as unknown as Record<string, boolean>;
      for (const [otherVar, otherKey] of Object.entries(readers)) {
        if (otherVar === variable) {
          assert.equal(matrix[own], true, `${variable} must open its own gate`);
        } else {
          assert.equal(
            matrix[otherKey],
            false,
            `${variable}=true must NOT open ${otherKey}`,
          );
        }
      }
    });
  }
});

test('the internal engine being on does not expose public intake', () => {
  // `offerr_evaluation_enabled` lives in rei-automation's system_control and is
  // not readable here at all. Even the OfferrAI-side backend gate, which is the
  // closest thing this app has to "the engine is on", must not admit a seller.
  withEnv({ ...PREVIEW, OFFERR_BACKEND_EVALUATION_ENABLED: 'true' }, () => {
    assert.equal(isBackendEvaluationEnabled(), true);
    assert.equal(isPublicIntakeEnabled(), false);
    assert.equal(gateMatrix().publicIntake, false);
  });
});

test('public intake being on does not bypass canary access', () => {
  withEnv({ ...PREVIEW, OFFERR_PUBLIC_INTAKE_ENABLED: 'true' }, () => {
    assert.equal(isPublicIntakeEnabled(), true);
    assert.equal(isCanaryAccessEnabled(), false);
  });
});

test('review handoff off prevents queue creation regardless of every other gate', () => {
  withEnv(
    {
      ...PREVIEW,
      OFFERR_PUBLIC_INTAKE_ENABLED: 'true',
      OFFERR_BACKEND_EVALUATION_ENABLED: 'true',
      OFFERR_CANARY_ACCESS_ENABLED: 'true',
    },
    () => {
      assert.equal(isReviewHandoffEnabled(), false);
      assert.equal(gateMatrix().reviewHandoff, false);
    },
  );
});

test('a production deployment forces every gate false, whatever is configured', () => {
  withEnv(
    {
      VERCEL_ENV: 'production',
      OFFERR_PUBLIC_INTAKE_ENABLED: 'true',
      OFFERR_BACKEND_EVALUATION_ENABLED: 'true',
      OFFERR_CANARY_ACCESS_ENABLED: 'true',
      OFFERR_REVIEW_HANDOFF_ENABLED: 'true',
    },
    () => {
      assert.equal(isProductionDeployment(), true);
      assert.deepEqual(gateMatrix(), {
        publicIntake: false,
        backendEvaluation: false,
        canaryAccess: false,
        reviewHandoff: false,
      });
    },
  );
});

test('only the literal string "true" opens a gate', () => {
  // A half-deployed or mistyped value must read as "closed", never as consent.
  for (const value of ['TRUE', 'True', '1', 'yes', 'on', 'enabled', '', ' ', 'trueish']) {
    withEnv({ ...PREVIEW, OFFERR_PUBLIC_INTAKE_ENABLED: value }, () => {
      assert.equal(
        isPublicIntakeEnabled(),
        value.trim().toLowerCase() === 'true',
        `"${value}" must not be read as permission unless it is exactly true`,
      );
    });
  }
});

test('no gate is exposed as a NEXT_PUBLIC_ variable', () => {
  // A client-readable flag is a display hint, not a control: the browser can lie
  // about it, so it must never be the thing that decides.
  for (const variable of GATE_VARS) {
    assert.equal(
      variable.startsWith('NEXT_PUBLIC_'),
      false,
      `${variable} must stay server-only`,
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(process.env, `NEXT_PUBLIC_${variable}`),
      false,
      `NEXT_PUBLIC_${variable} must not exist`,
    );
  }
});
