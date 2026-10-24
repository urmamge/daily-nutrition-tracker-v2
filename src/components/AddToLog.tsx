import { useState } from "react";
import { Badge, Button, Center, Chip, Group, NumberInput, Paper, SimpleGrid, Stack, Text, ThemeIcon, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconPlus, IconToolsKitchen2 } from "@tabler/icons-react";
import type { Food } from "../../shared/types.ts";
import { nutrientsFromPer100 } from "../../shared/types.ts";
import { api } from "../api.ts";
import dayjs from "dayjs";
import { dayLabel, fmtG, fmtKcal, MACROS, notifyError, todayIso } from "../format.ts";

const QUICK_GRAMS = [30, 50, 100, 150, 200];

interface Props {
  food: Food | null;
  date: string;
  onAdded: () => void;
}

export function AddToLog({ food, date, onAdded }: Props) {
  const [grams, setGrams] = useState<number | string>(100);
  const [saving, setSaving] = useState(false);
  const gramsValue = typeof grams === "number" ? grams : Number(grams);
  const valid = Number.isFinite(gramsValue) && gramsValue > 0;

  if (!food) {
    return (
      <Paper withBorder radius="lg" p="lg" shadow="xs">
        <Center py="md">
          <Stack align="center" gap="xs">
            <ThemeIcon size={44} radius="xl" variant="light">
              <IconToolsKitchen2 size={24} />
            </ThemeIcon>
            <Text fw={600}>No food selected</Text>
            <Text size="sm" c="dimmed" ta="center" maw={280}>
              Pick a food from the search results or your saved foods, or create a custom one.
            </Text>
          </Stack>
        </Center>
      </Paper>
    );
  }

  const portion = nutrientsFromPer100(food, valid ? gramsValue : 0);

  async function add() {
    if (!food || !valid) return;
    setSaving(true);
    try {
      await api.addEntry(food, gramsValue, date);
      notifications.show({ color: "green", message: `Added ${fmtG(gramsValue)} g of ${food.name} to ${dayLabel(date).toLowerCase()}.` });
      onAdded();
    } catch (e) {
      notifyError(e, "Could not add to the log");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Paper withBorder radius="lg" p="lg" shadow="xs">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <Stack gap="md">
          <div>
            <Group gap="xs" mb={4}>
              <Badge variant="light" color={food.source === "Custom" ? "grape" : "teal"} size="sm">
                {food.source === "Custom" ? "My food" : "Open Food Facts"}
              </Badge>
              <Text size="xs" c="dimmed">
                {fmtKcal(food.calories)} kcal / 100 g
              </Text>
            </Group>
            <Title order={4} lineClamp={2}>
              {food.name}
            </Title>
            {food.brand && (
              <Text size="sm" c="dimmed" lineClamp={1}>
                {food.brand}
              </Text>
            )}
          </div>

          <div>
            <NumberInput
              label="Portion weight"
              value={grams}
              onChange={setGrams}
              min={0}
              step={10}
              decimalScale={1}
              suffix=" g"
              error={!valid && "Enter a positive weight"}
            />
            <Chip.Group value={String(gramsValue)} onChange={(v) => setGrams(Number(v))}>
              <Group gap={6} mt="xs">
                {QUICK_GRAMS.map((g) => (
                  <Chip key={g} value={String(g)} size="xs" variant="outline">
                    {g} g
                  </Chip>
                ))}
              </Group>
            </Chip.Group>
          </div>

          <SimpleGrid cols={4} spacing="xs">
            <Stat label="Calories" value={fmtKcal(portion.calories)} unit="kcal" color="violet" />
            {MACROS.map((m) => (
              <Stat key={m.key} label={m.label} value={fmtG(portion[m.key])} unit="g" color={m.color} />
            ))}
          </SimpleGrid>

          <Button type="submit" size="md" leftSection={<IconPlus size={18} />} disabled={!valid} loading={saving}>
            {date === todayIso() ? "Add to today's log" : `Add to log for ${dayjs(date).format("ddd D MMM")}`}
          </Button>
        </Stack>
      </form>
    </Paper>
  );
}

function Stat({ label, value, unit, color }: { label: string; value: string; unit: string; color: string }) {
  return (
    <Paper radius="md" p="xs" bg={`var(--mantine-color-${color}-light)`}>
      <Text size="xs" c={`${color}.7`} fw={600}>
        {label}
      </Text>
      <Text fw={700} size="lg" lh={1.2}>
        {value}
        <Text span size="xs" c="dimmed" fw={500}>
          {" "}
          {unit}
        </Text>
      </Text>
    </Paper>
  );
}
