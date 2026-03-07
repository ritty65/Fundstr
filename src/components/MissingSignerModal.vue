<template>
  <q-dialog
    ref="dialogRef"
    v-model="ui.showMissingSignerModal"
    @hide="onDialogHide"
  >
    <q-card class="q-pa-md">
      <q-card-section>
        <div class="text-h6">Missing Signer</div>
        <div class="text-subtitle2">Choose how to sign P2PK proofs</div>
      </q-card-section>
      <q-card-section>
        <q-input v-model="nsec" type="password" label="nsec" dense autofocus />
      </q-card-section>
      <q-card-actions vertical class="q-gutter-sm">
        <q-btn color="primary" @click="chooseLocal">Use pasted nsec</q-btn>
        <q-btn color="primary" @click="chooseNip07">Use NIP-07</q-btn>
        <q-btn color="primary" @click="chooseNip46">Use NIP-46</q-btn>
        <q-btn flat v-close-popup color="grey">Cancel</q-btn>
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script lang="ts" setup>
import { ref } from "vue";
import { useSignerStore } from "src/stores/signer";
import { useUiStore } from "src/stores/ui";
import { notifyError } from "src/js/notify";

const props = defineProps<{ dialogRef?: any }>();
const emit = defineEmits(["ok", "hide"]);
// Ensure dialogRef is always a Vue ref to avoid warnings
const dialogRef = props.dialogRef ?? ref(null);
const ui = useUiStore();
function onDialogHide() {
  ui.showMissingSignerModal = false;
  emit("hide");
}
const signer = useSignerStore();
const nsec = ref("");

function chooseLocal() {
  try {
    signer.loginWithNsec(nsec.value);
  } catch (e) {
    notifyError("Invalid nsec");
    return;
  }
  emit("ok");
  dialogRef.value?.hide();
}
function chooseNip07() {
  signer.loginWithExtension();
  emit("ok");
  dialogRef.value?.hide();
}
function chooseNip46() {
  signer.loginWithNostrConnect();
  emit("ok");
  dialogRef.value?.hide();
}
</script>
