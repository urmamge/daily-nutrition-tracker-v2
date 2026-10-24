import { useState } from "react";
import { Alert, Button, Group, Modal, Paper, PasswordInput, Stack, Text, TextInput, ThemeIcon, Title } from "@mantine/core";
import { IconCloud, IconCloudCheck, IconRefresh } from "@tabler/icons-react";
import type { SyncStatus } from "../../shared/types.ts";
import { api } from "../api.ts";
import { notifyError } from "../format.ts";

export function SyncCard({ status }: { status: SyncStatus | null }) {
  const [open, setOpen] = useState(false);
  const connected = !!status?.connected;

  return (
    <Paper withBorder radius="lg" p="lg" shadow="xs">
      <Group justify="space-between" wrap="nowrap">
        <Group gap="md" wrap="nowrap">
          <ThemeIcon size={40} radius="xl" variant="light" color={connected ? "teal" : "gray"}>
            {connected ? <IconCloudCheck size={22} /> : <IconCloud size={22} />}
          </ThemeIcon>
          <div>
            <Title order={5}>Website sync</Title>
            <Text size="sm" c="dimmed">
              {status?.message ?? "Checking…"}
            </Text>
          </div>
        </Group>
        {connected ? (
          <Button
            variant="light"
            leftSection={<IconRefresh size={16} />}
            loading={status?.busy}
            onClick={() => api.syncNow().catch((e) => notifyError(e))}
          >
            Sync now
          </Button>
        ) : (
          <Button variant="light" loading={status?.busy} onClick={() => setOpen(true)}>
            Connect & sync
          </Button>
        )}
      </Group>
      {status?.error && (
        <Alert color="red" variant="light" mt="md">
          {status.error}
        </Alert>
      )}
      {status && <ConnectModal opened={open} onClose={() => setOpen(false)} status={status} />}
    </Paper>
  );
}

function ConnectModal({ opened, onClose, status }: { opened: boolean; onClose: () => void; status: SyncStatus }) {
  const [url, setUrl] = useState(status.savedUrl);
  const [anonKey, setAnonKey] = useState(status.savedAnonKey);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    try {
      await api.syncConnect(url, anonKey, email, password);
      setPassword("");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Modal opened={opened} onClose={onClose} title="Connect to the history website" centered radius="lg" size="lg">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Stack gap="sm">
          <TextInput label="Supabase project URL" placeholder="https://xyz.supabase.co" value={url} onChange={(e) => setUrl(e.currentTarget.value)} />
          <TextInput label="Supabase anon/public key" value={anonKey} onChange={(e) => setAnonKey(e.currentTarget.value)} />
          <TextInput label="Account email" type="email" value={email} onChange={(e) => setEmail(e.currentTarget.value)} />
          <PasswordInput label="Account password" value={password} onChange={(e) => setPassword(e.currentTarget.value)} />
          <Text size="xs" c="dimmed">
            The project URL and public key are saved locally. Your password is only used to sign in; the session is stored
            protected with Windows DPAPI.
          </Text>
          {error && (
            <Alert color="red" variant="light">
              {error}
            </Alert>
          )}
          <Group justify="flex-end" mt="xs">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Sign in & sync history</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
