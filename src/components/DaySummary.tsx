import { Grid, Group, Paper, Progress, SimpleGrid, Stack, Text } from "@mantine/core";
import { DonutChart } from "@mantine/charts";
import type { DayLog } from "../../shared/types.ts";
import { ZERO } from "../../shared/types.ts";
import { fmtG, fmtKcal, MACROS } from "../format.ts";

export function DaySummary({ day }: { day: DayLog | null }) {
  const totals = day?.totals ?? ZERO;
  const macroKcal = MACROS.map((m) => ({ ...m, kcal: totals[m.key] * m.kcalPerGram }));
  const macroTotal = macroKcal.reduce((sum, m) => sum + m.kcal, 0);
  const share = (kcal: number) => (macroTotal ? (kcal / macroTotal) * 100 : 0);

  const donutData = macroTotal
    ? macroKcal.map((m) => ({ name: m.label, value: Math.round(m.kcal), color: `${m.color}.6` }))
    : [{ name: "Nothing logged", value: 1, color: "gray.3" }];

  return (
    <Paper withBorder radius="lg" p="lg" shadow="xs">
      <Grid gap="xl" align="center">
        <Grid.Col span={{ base: 12, sm: 5, md: 4 }}>
          <Group gap="lg" wrap="nowrap">
            <DonutChart
              data={donutData}
              size={128}
              thickness={16}
              withTooltip={macroTotal > 0}
              tooltipDataSource="segment"
              valueFormatter={(v) => `${fmtKcal(v)} kcal`}
              paddingAngle={macroTotal ? 2 : 0}
            />
            <Stack gap={2}>
              <Text size="sm" c="dimmed" fw={500}>
                Calories
              </Text>
              <Group gap={6} align="baseline">
                <Text fz={40} fw={700} lh={1} c="violet">
                  {fmtKcal(totals.calories)}
                </Text>
                <Text c="dimmed" fw={500}>
                  kcal
                </Text>
              </Group>
              <Text size="sm" c="dimmed">
                {day?.entries.length ?? 0} {day?.entries.length === 1 ? "food" : "foods"} logged
              </Text>
            </Stack>
          </Group>
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 7, md: 8 }}>
          <SimpleGrid cols={3} spacing="md">
            {macroKcal.map((m) => (
              <Paper key={m.key} radius="md" p="md" bg={`var(--mantine-color-${m.color}-light)`}>
                <Text size="sm" fw={600} c={`${m.color}.7`}>
                  {m.label}
                </Text>
                <Group gap={4} align="baseline" mt={4}>
                  <Text fz={26} fw={700} lh={1.1}>
                    {fmtG(totals[m.key])}
                  </Text>
                  <Text size="sm" c="dimmed">
                    g
                  </Text>
                </Group>
                <Progress value={share(m.kcal)} color={m.color} size="sm" mt="sm" radius="xl" />
                <Text size="xs" c="dimmed" mt={6}>
                  {Math.round(share(m.kcal))}% of energy from macros
                </Text>
              </Paper>
            ))}
          </SimpleGrid>
        </Grid.Col>
      </Grid>
    </Paper>
  );
}
