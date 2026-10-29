/** Themed gifted-charts wrappers. Each takes ready-made data from chartData.ts and a width. */
import { BarChart, LineChart } from 'react-native-gifted-charts';

import type { DimensionComparisonRow, SeriesPoint } from '../chartData';
import { groupedBarData, masteryLine, niceMax, thinLabels } from '../chartData';
import { useChartTheme } from './ChartFrame';

const CHART_HEIGHT = 170;

function lineSpacing(width: number, n: number, yAxis: number) {
  const usable = width - yAxis - 24;
  return n > 1 ? Math.max(8, usable / (n - 1)) : usable / 2;
}

/** Session Score (0–100) over time. */
export function ScoreTrendChart({ points, width, color, height = CHART_HEIGHT }: { points: SeriesPoint[]; width: number; color?: string; height?: number }) {
  const c = useChartTheme();
  const stroke = color ?? c.colors.primary;
  const data = thinLabels(points).map((p) => ({ value: p.value, label: p.label }));
  return (
    <LineChart
      {...c.common}
      data={data}
      width={width - c.yAxisLabelWidth - 12}
      height={height}
      yAxisLabelWidth={c.yAxisLabelWidth}
      maxValue={100}
      noOfSections={4}
      initialSpacing={12}
      endSpacing={12}
      spacing={lineSpacing(width, data.length, c.yAxisLabelWidth)}
      color={stroke}
      thickness={2.5}
      dataPointsColor={stroke}
      dataPointsRadius={3.5}
      areaChart
      startFillColor={stroke}
      endFillColor={c.colors.surface}
      startOpacity={0.18}
      endOpacity={0.02}
    />
  );
}

/** Goal accuracy (%) per session with the mastery rule drawn as a dashed line. */
export function GoalAccuracyChart({
  points,
  accuracy,
  width,
  color,
  height = 150,
}: {
  points: SeriesPoint[];
  accuracy: number;
  width: number;
  color?: string;
  height?: number;
}) {
  const c = useChartTheme();
  const stroke = color ?? c.colors.primary;
  const data = thinLabels(points).map((p) => ({ value: p.value, label: p.label }));
  const line = masteryLine(data.length, accuracy).map((value) => ({ value }));
  return (
    <LineChart
      {...c.common}
      data={data}
      data2={line}
      width={width - c.yAxisLabelWidth - 12}
      height={height}
      yAxisLabelWidth={c.yAxisLabelWidth}
      maxValue={100}
      noOfSections={4}
      initialSpacing={12}
      endSpacing={12}
      spacing={lineSpacing(width, data.length, c.yAxisLabelWidth)}
      color1={stroke}
      color2={c.colors.mastery}
      thickness1={2.5}
      thickness2={1.5}
      strokeDashArray2={[6, 4]}
      hideDataPoints2
      dataPointsColor1={stroke}
      dataPointsRadius={3.5}
    />
  );
}

/** Latest session vs the 4 sessions before it, per dimension (grouped bars, 1–5). */
export function DimensionCompareChart({ rows, width, shortLabel }: { rows: DimensionComparisonRow[]; width: number; shortLabel: (l: string) => string }) {
  const c = useChartTheme();
  const groups = rows.filter((r) => r.latest != null || r.average != null).length || 1;
  const usable = width - c.yAxisLabelWidth - 24;
  const perGroup = usable / groups;
  const groupGap = Math.max(8, Math.min(18, perGroup * 0.35));
  const innerGap = 2;
  const barWidth = Math.max(6, Math.min(16, (perGroup - groupGap - innerGap) / 2));
  const data = groupedBarData(rows, { averageColor: c.colors.muted, latestColor: c.colors.primary, barWidth, innerGap, groupGap, shortLabel });
  return (
    <BarChart
      {...c.common}
      data={data.map((b) => ({ ...b, labelTextStyle: c.common.xAxisLabelTextStyle }))}
      labelWidth={perGroup}
      width={usable}
      height={CHART_HEIGHT - 20}
      yAxisLabelWidth={c.yAxisLabelWidth}
      maxValue={5}
      noOfSections={5}
      initialSpacing={8}
      endSpacing={4}
      roundedTop
      barBorderTopLeftRadius={4}
      barBorderTopRightRadius={4}
    />
  );
}

/** Behaviour incidents per week. */
export function IncidentsChart({ points, width }: { points: SeriesPoint[]; width: number }) {
  const c = useChartTheme();
  const n = Math.max(points.length, 1);
  const usable = width - c.yAxisLabelWidth - 24;
  const barWidth = Math.max(8, Math.min(22, (usable / n) * 0.55));
  const spacing = Math.max(4, usable / n - barWidth);
  const max = niceMax(points.map((p) => p.value), 4, 2);
  return (
    <BarChart
      {...c.common}
      data={thinLabels(points, 6).map((p) => ({ value: p.value, label: p.label, frontColor: c.colors.incidents }))}
      width={usable}
      height={120}
      yAxisLabelWidth={c.yAxisLabelWidth}
      maxValue={max}
      noOfSections={max / 2}
      barWidth={barWidth}
      spacing={spacing}
      initialSpacing={8}
      roundedTop
    />
  );
}
