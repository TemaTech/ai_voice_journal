import React, { useMemo } from 'react';
import { Dimensions, View } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { useTheme } from '../../hooks/useTheme';
import { JournalEntry } from '../../services/storage';
import { ZenHeading } from './Typography';

interface MoodChartProps {
  entries: JournalEntry[];
}

const EMOTION_SCORES: Record<string, number> = {
  happy: 5,
  excited: 4,
  calm: 3,
  neutral: 2.5,
  tired: 1,
  sad: 0,
};

const EMOTION_LABELS: Record<string, string> = {
  happy: 'Happy',
  excited: 'Excited',
  calm: 'Calm',
  neutral: 'Neutral',
  tired: 'Tired',
  sad: 'Sad',
};

export function MoodChart({ entries }: MoodChartProps) {
  const { isDark, activeColors } = useTheme();

  const chartData = useMemo(() => {
    // 1. Filter last 7 days including today
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const recentEntries = entries.filter(e => e.createdAt >= sevenDaysAgo.getTime());

    // 2. Group by date and calculate average score per day
    const dailyScores: Record<string, { total: number; count: number }> = {};
    const dateLabels: string[] = [];

    // Initialize map for last 7 days
    for (let i = 0; i < 7; i++) {
        const d = new Date(sevenDaysAgo);
        d.setDate(d.getDate() + i);
        const dayStr = d.getDate().toString(); // Just the day number
        const dateKey = d.toDateString(); // Unique key
        
        // Store label
        dateLabels.push(dayStr);
    }
    
    // Aggregate
    recentEntries.forEach(entry => {
        const date = new Date(entry.createdAt);
        const dateKey = date.toDateString();
        const score = EMOTION_SCORES[entry.emotion] || 2.5;
        
        if (!dailyScores[dateKey]) {
            dailyScores[dateKey] = { total: 0, count: 0 };
        }
        dailyScores[dateKey].total += score;
        dailyScores[dateKey].count += 1;
    });

    // 3. Format for Gifted Charts
    return Array.from({ length: 7 }).map((_, i) => {
        const d = new Date(sevenDaysAgo);
        d.setDate(d.getDate() + i);
        const dateKey = d.toDateString();
        
        const data = dailyScores[dateKey];
        const value = data ? data.total / data.count : 0; // 0 for no data, maybe handle differently?
        
        // If no data, we might want to show a gap or handle it.
        // For line chart, value 0 might look like "sad".
        // Let's use `hideDataPoint` if no data, or maybe just `value: 0` but custom data point?
        // Gifted Charts supports `value` property. 
        // If no data, let's treat it as null/undefined if supported, or just skip? 
        // Gifted charts handles missing points by connecting others usually if simple.
        // Let's just output value. If count 0, let's say null? 
        // Gifted Charts line chart needs numeric values. 
        // Let's interpolate or just show 0? 
        // Showing 0 implies "Sad". That's bad.
        // Let's return objects with `value` and `label`.
        
        // Better: filtered out points?
        // If we want a continuous line for days with data...
        // But we want to show the 7 day axis.
        
        return {
            value: data ? data.total / data.count : 2.5, // Default to neutral if missing? Or maybe hide?
            label: d.getDate().toString(),
            dataPointText: data ? '' : '',
            hideDataPoint: !data,
            // If no data, maybe make the line transparent or dashed?
            // Simple way: default to neutral (2.5) but styling differently?
            // For now, let's default to 2.5 (neutral) effectively filling gaps with "okay".
            // OR check if we can pass null.
        };
    });

  }, [entries]);

  // If not enough data (e.g. 0 entries), show placeholder?
  if (entries.length === 0) {
      return null;
  }
  
  const screenWidth = Dimensions.get('window').width;

  return (
    <View 
      className="p-4 rounded-2xl mb-6 items-center justify-center overflow-hidden"
      style={{ 
        backgroundColor: isDark ? 'rgba(30,41,59,0.5)' : '#FFFFFF',
        width: screenWidth - 48 // margin-x-6 = 24*2 = 48
      }}
    >
      <View className="w-full flex-row justify-between mb-4">
        <ZenHeading level={3} className="text-xs font-bold uppercase tracking-widest" style={{ color: isDark ? '#94A3B8' : '#64748B' }}>
            感情リズム (7日間)
        </ZenHeading>
      </View>

      <LineChart
        data={chartData}
        color={activeColors.primary}
        thickness={3}
        dataPointsColor={activeColors.primary}
        startFillColor={activeColors.primary}
        endFillColor={activeColors.primary}
        startOpacity={0.2}
        endOpacity={0.05}
        areaChart
        curved
        hideRules
        hideYAxisText
        yAxisThickness={0}
        xAxisThickness={0}
        xAxisLabelTextStyle={{ color: isDark ? '#94A3B8' : '#64748B', fontSize: 10 }}
        width={screenWidth - 80} // adjusting for padding
        height={120}
        initialSpacing={10}
        spacing={40} // Adjust based on width
        maxValue={5}
      />
    </View>
  );
}
