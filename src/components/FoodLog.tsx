import { ActionIcon, Badge, Box, Center, Group, Paper, ScrollArea, Stack, Text, Title, Tooltip } from "@mantine/core";
import { modals } from "@mantine/modals";
import { IconBowl, IconTrash } from "@tabler/icons-react";
import type { DayLog, Entry } from "../../shared/types.ts";
import { api } from "../api.ts";
import { fmtG, fmtKcal, MACROS, notifyError } from "../format.ts";

export function FoodLog({ day, onRemoved }: { day: DayLog | null; onRemoved: () => void }) {
  const entries = day?.entries ?? [];

  const confirmRemove = (entry: Entry) =>
    modals.openConfirmModal({
      title: "Remove entry",
      children: (
        <Text size="sm">
          Remove <b>{entry.food_name}</b> ({fmtG(entry.grams)} g) from this day's log?
        </Text>
      ),
      labels: { confirm: "Remove", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: () => api.removeEntry(entry.id).then(onRemoved, (e) => notifyError(e, "Could not remove the entry")),
    });

  return (
    <Paper withBorder radius="lg" p="lg" shadow="xs">
      <Group justify="space-between" mb="sm">
        <Title order={4}>Food log</Title>
        <Badge variant="light" color="gray">
          {entries.length} {entries.length === 1 ? "item" : "items"}
        </Badge>
      </Group>
      {entries.length === 0 ? (
        <Center py="xl">
          <Stack align="center" gap={4}>
            <IconBowl size={36} stroke={1.4} color="var(--mantine-color-dimmed)" />
            <Text c="dimmed" size="sm">
              Nothing logged for this day yet.
            </Text>
          </Stack>
        </Center>
      ) : (
        <ScrollArea.Autosize mah={520} type="auto" offsetScrollbars>
          {entries.map((e) => (
            <Box key={e.id} className="log-item" py="sm">
              <Group justify="space-between" wrap="nowrap" gap="sm">
                <Box miw={0}>
                  <Text fw={500} lineClamp={1}>
                    {e.food_name}
                  </Text>
                  <Group gap="xs" mt={2}>
                    <Text size="xs" c="dimmed">
                      {fmtG(e.grams)} g
                    </Text>
                    {MACROS.map((m) => (
                      <Text key={m.key} size="xs" c={`${m.color}.7`}>
                        {m.label[0]} {fmtG(e[m.key])}
                      </Text>
                    ))}
                  </Group>
                </Box>
                <Group gap="xs" wrap="nowrap">
                  <Text fw={700} style={{ whiteSpace: "nowrap" }}>
                    {fmtKcal(e.calories)}{" "}
                    <Text span size="xs" c="dimmed" fw={500}>
                      kcal
                    </Text>
                  </Text>
                  <Tooltip label="Remove">
                    <ActionIcon className="remove" variant="subtle" color="red" onClick={() => confirmRemove(e)} aria-label={`Remove ${e.food_name}`}>
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </Group>
            </Box>
          ))}
        </ScrollArea.Autosize>
      )}
    </Paper>
  );
}
