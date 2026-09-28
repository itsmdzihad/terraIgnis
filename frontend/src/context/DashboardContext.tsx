import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { FireSensor } from '../types/fire';

interface DashboardContextValue {
  selectedDate: string | null;
  selectedStartDate: string;
  selectedEndDate: string;
  selectedH3Cell: string | null;
  selectedSensor: FireSensor | null;
  minBurnIndex: number | null;
  maxBurnIndex: number | null;
  setSelectedDate: (date: string | null) => void;
  setDateRange: (startDate: string, endDate: string) => void;
  setSelectedYear: (year: number) => void;
  setSelectedH3Cell: (h3Cell: string | null) => void;
  setSelectedSensor: (sensor: FireSensor | null) => void;
  setBurnIndexRange: (min: number | null, max: number | null) => void;
  clearFilters: () => void;
}

const INITIAL_START_DATE = '2026-01-01';
const INITIAL_END_DATE = '2026-12-31';

const DashboardContext = createContext<DashboardContextValue | null>(null);

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [selectedDate, setSelectedDateState] = useState<string | null>(null);
  const [selectedStartDate, setSelectedStartDate] = useState(INITIAL_START_DATE);
  const [selectedEndDate, setSelectedEndDate] = useState(INITIAL_END_DATE);
  const [selectedH3Cell, updateSelectedH3Cell] = useState<string | null>(null);
  const [selectedSensor, updateSelectedSensor] = useState<FireSensor | null>(null);
  const [minBurnIndex, setMinBurnIndex] = useState<number | null>(null);
  const [maxBurnIndex, setMaxBurnIndex] = useState<number | null>(null);

  const setDateRange = useCallback((startDate: string, endDate: string) => {
    if (startDate > endDate) return;
    setSelectedStartDate(startDate);
    setSelectedEndDate(endDate);
    setSelectedDateState((date) => date && (date < startDate || date > endDate) ? null : date);
  }, []);

  const setSelectedYear = useCallback((year: number) => {
    setDateRange(`${year}-01-01`, `${year}-12-31`);
  }, [setDateRange]);

  const setSelectedDate = useCallback((date: string | null) => {
    setSelectedDateState(date);
    if (date && (date < selectedStartDate || date > selectedEndDate)) {
      const year = date.slice(0, 4);
      setSelectedStartDate(`${year}-01-01`);
      setSelectedEndDate(`${year}-12-31`);
    }
  }, [selectedEndDate, selectedStartDate]);

  const setSelectedH3Cell = useCallback((h3Cell: string | null) => {
    updateSelectedH3Cell(h3Cell?.trim() || null);
  }, []);

  const setSelectedSensor = useCallback((sensor: FireSensor | null) => {
    updateSelectedSensor(sensor);
  }, []);

  const setBurnIndexRange = useCallback((min: number | null, max: number | null) => {
    setMinBurnIndex(min);
    setMaxBurnIndex(max);
  }, []);

  const clearFilters = useCallback(() => {
    setSelectedDateState(null);
    setSelectedStartDate(INITIAL_START_DATE);
    setSelectedEndDate(INITIAL_END_DATE);
    setSelectedH3Cell(null);
    setSelectedSensor(null);
    setMinBurnIndex(null);
    setMaxBurnIndex(null);
  }, []);

  const value = useMemo<DashboardContextValue>(() => ({
    selectedDate,
    selectedStartDate,
    selectedEndDate,
    selectedH3Cell,
    selectedSensor,
    minBurnIndex,
    maxBurnIndex,
    setSelectedDate,
    setDateRange,
    setSelectedYear,
    setSelectedH3Cell,
    setSelectedSensor,
    setBurnIndexRange,
    clearFilters,
  }), [
    selectedDate,
    selectedStartDate,
    selectedEndDate,
    selectedH3Cell,
    selectedSensor,
    minBurnIndex,
    maxBurnIndex,
    setSelectedDate,
    setDateRange,
    setSelectedYear,
    setSelectedH3Cell,
    setSelectedSensor,
    setBurnIndexRange,
    clearFilters,
  ]);

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

export function useDashboard(): DashboardContextValue {
  const context = useContext(DashboardContext);
  if (!context) throw new Error('useDashboard must be used within DashboardProvider.');
  return context;
}
