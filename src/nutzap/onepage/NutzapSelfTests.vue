<template>
  <div class="self-tests column q-gutter-md">
    <div class="text-caption text-2">
      These checks run entirely in the browser to verify Nutzap tooling prerequisites.
    </div>

    <div class="row q-gutter-sm">
      <q-btn color="primary" :disable="running" :loading="running" label="Run self-tests" @click="runTests" />
      <q-btn flat color="primary" label="Reset" :disable="running" @click="reset" />
    </div>

    <q-banner :class="overallBannerClass" class="text-white" v-if="overallStatus !== 'pending'">
      {{ overallMessage }}
    </q-banner>

    <div class="column q-gutter-sm">
      <q-banner
        v-for="test in testStates"
        :key="test.id"
        :class="bannerClass(test.status)"
      >
        <div class="row items-center justify-between">
          <div>
            <div class="text-subtitle2">{{ test.label }}</div>
            <div class="text-caption text-2">
              {{ statusMessage(test) }}
            </div>
          </div>
          <q-spinner v-if="test.status === 'running'" size="16px" color="white" />
        </div>
      </q-banner>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';

type TestStatus = 'pending' | 'running' | 'pass' | 'fail';

type SelfTest = {
  id: string;
  label: string;
  run: () => void | Promise<void>;
};

type TestState = SelfTest & {
  status: TestStatus;
  message: string;
};

const definitions: SelfTest[] = [
  {
    id: 'websocket',
    label: 'WebSocket availability',
    run: () => {
      if (typeof WebSocket === 'undefined') {
        throw new Error('WebSocket API not available');
      }
    },
  },
  {
    id: 'crypto',
    label: 'Secure randomness (crypto.getRandomValues)',
    run: () => {
      if (!window.crypto?.getRandomValues) {
        throw new Error('crypto.getRandomValues unavailable');
      }
      const buf = new Uint8Array(16);
      window.crypto.getRandomValues(buf);
      if (!buf.some((value) => value !== 0)) {
        throw new Error('crypto.getRandomValues returned all zeros');
      }
    },
  },
  {
    id: 'subtle',
    label: 'SubtleCrypto digest',
    run: async () => {
      if (!window.crypto?.subtle) {
        throw new Error('window.crypto.subtle unavailable');
      }
      const encoder = new TextEncoder();
      const data = encoder.encode('fundstr-self-test');
      const digest = await window.crypto.subtle.digest('SHA-256', data);
      if (!(digest instanceof ArrayBuffer) || digest.byteLength === 0) {
        throw new Error('Digest failed');
      }
    },
  },
  {
    id: 'storage',
    label: 'Local storage round-trip',
    run: () => {
      if (!window.localStorage) {
        throw new Error('localStorage unavailable');
      }
      const key = `nutzap-self-test-${Date.now()}`;
      const value = 'ok';
      window.localStorage.setItem(key, value);
      const stored = window.localStorage.getItem(key);
      window.localStorage.removeItem(key);
      if (stored !== value) {
        throw new Error('localStorage mismatch');
      }
    },
  },
  {
    id: 'text-encoder',
    label: 'TextEncoder support',
    run: () => {
      try {
        const encoder = new TextEncoder();
        const bytes = encoder.encode('test');
        if (!(bytes instanceof Uint8Array) || bytes.length === 0) {
          throw new Error('TextEncoder produced no output');
        }
      } catch (err) {
        throw err instanceof Error ? err : new Error(String(err));
      }
    },
  },
];

const testStates = reactive<TestState[]>(definitions.map((def) => ({ ...def, status: 'pending', message: 'Waiting to run…' })));

const running = ref(false);

const overallStatus = computed<TestStatus>(() => {
  if (testStates.some((test) => test.status === 'running')) {
    return 'running';
  }
  if (testStates.some((test) => test.status === 'fail')) {
    return 'fail';
  }
  if (testStates.every((test) => test.status === 'pass')) {
    return 'pass';
  }
  return 'pending';
});

const overallMessage = computed(() => {
  switch (overallStatus.value) {
    case 'running':
      return 'Running diagnostics…';
    case 'pass':
      return 'All diagnostics passed.';
    case 'fail':
      return 'One or more diagnostics failed.';
    default:
      return '';
  }
});

const overallBannerClass = computed(() => {
  switch (overallStatus.value) {
    case 'running':
      return 'bg-accent';
    case 'pass':
      return 'bg-positive';
    case 'fail':
      return 'bg-negative';
    default:
      return '';
  }
});

function statusMessage(test: TestState): string {
  switch (test.status) {
    case 'pending':
      return 'Not run yet.';
    case 'running':
      return 'Running…';
    case 'pass':
      return test.message || 'Passed';
    case 'fail':
      return test.message || 'Failed';
    default:
      return '';
  }
}

function bannerClass(status: TestStatus): string {
  switch (status) {
    case 'running':
      return 'bg-accent text-white';
    case 'pass':
      return 'bg-positive text-white';
    case 'fail':
      return 'bg-negative text-white';
    default:
      return 'bg-grey-4 text-dark';
  }
}

function reset() {
  if (running.value) return;
  for (const test of testStates) {
    test.status = 'pending';
    test.message = 'Waiting to run…';
  }
}

async function runTests() {
  if (running.value) return;
  running.value = true;
  for (const test of testStates) {
    test.status = 'running';
    test.message = '';
    try {
      await test.run();
      test.status = 'pass';
      test.message = 'Passed';
    } catch (err) {
      test.status = 'fail';
      test.message = err instanceof Error ? err.message : String(err);
    }
  }
  running.value = false;
}

onMounted(() => {
  runTests();
});
</script>

<style scoped>
.self-tests {
  max-width: 100%;
}
</style>
