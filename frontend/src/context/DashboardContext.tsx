import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { FireSensor } from '../types/fire';

interface DashboardContextValue {
  selectedDate: string | null;
  calendarYear: number;
  selectedStartDate: string;
  selectedEndDate: string;
  selectedH3Cell: string | null;
  selectedCountry: string | null;
  selectedSensor: FireSensor | null;
  minBurnIndex: number | null;
  maxBurnIndex: number | null;
  setSelectedDate: (date: string | null) => void;
  setDateRange: (startDate: string, endDate: string) => void;
  setSelectedYear: (year: number) => void;
  setSelectedH3Cell: (h3Cell: string | null) => void;
  setSelectedCountry: (country: string | null) => void;
  setSelectedSensor: (sensor: FireSensor | null) => void;
  setBurnIndexRange: (min: number | null, max: number | null) => void;
  clearFilters: () => void;
}

function getLocalDateString(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const INITIAL_DATE = getLocalDateString();
const INITIAL_YEAR = Number(INITIAL_DATE.slice(0, 4));
const INITIAL_START_DATE = `${INITIAL_YEAR}-01-01`;
const INITIAL_END_DATE = `${INITIAL_YEAR}-12-31`;

const DashboardContext = createContext<DashboardContextValue | null>(null);

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [selectedDate, setSelectedDateState] = useState<string | null>(INITIAL_DATE);
  const [calendarYear, setCalendarYear] = useState(INITIAL_YEAR);
  const [selectedStartDate, setSelectedStartDate] = useState(INITIAL_START_DATE);
  const [selectedEndDate, setSelectedEndDate] = useState(INITIAL_END_DATE);
  const [selectedH3Cell, updateSelectedH3Cell] = useState<string | null>(null);
  const [selectedCountry, updateSelectedCountry] = useState<string | null>(null);
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
    setCalendarYear(year);
    setSelectedDateState(null);
    setDateRange(`${year}-01-01`, `${year}-12-31`);
  }, [setDateRange]);

  const setSelectedDate = useCallback((date: string | null) => {
    setSelectedDateState(date);
    if (date) {
      const year = date.slice(0, 4);
      setCalendarYear(Number(year));
      if (date < selectedStartDate || date > selectedEndDate) {
        setSelectedStartDate(`${year}-01-01`);
        setSelectedEndDate(`${year}-12-31`);
      }
    }
  }, [selectedEndDate, selectedStartDate]);

  const setSelectedH3Cell = useCallback((h3Cell: string | null) => {
    updateSelectedH3Cell(h3Cell?.trim() || null);
  }, []);

  const setSelectedCountry = useCallback((country: string | null) => {
    updateSelectedCountry(country?.trim() || null);
    updateSelectedH3Cell(null);
  }, []);

  const setSelectedSensor = useCallback((sensor: FireSensor | null) => {
    updateSelectedSensor(sensor);
  }, []);

  const setBurnIndexRange = useCallback((min: number | null, max: number | null) => {
    setMinBurnIndex(min);
    setMaxBurnIndex(max);
  }, []);

  const clearFilters = useCallback(() => {
    setSelectedDateState(INITIAL_DATE);
    setCalendarYear(INITIAL_YEAR);
    setSelectedStartDate(INITIAL_START_DATE);
    setSelectedEndDate(INITIAL_END_DATE);
    setSelectedH3Cell(null);
    setSelectedCountry(null);
    setSelectedSensor(null);
    setMinBurnIndex(null);
    setMaxBurnIndex(null);
  }, []);

  const value = useMemo<DashboardContextValue>(() => ({
    selectedDate,
    calendarYear,
    selectedStartDate,
    selectedEndDate,
    selectedH3Cell,
    selectedCountry,
    selectedSensor,
    minBurnIndex,
    maxBurnIndex,
    setSelectedDate,
    setDateRange,
    setSelectedYear,
    setSelectedH3Cell,
    setSelectedCountry,
    setSelectedSensor,
    setBurnIndexRange,
    clearFilters,
  }), [
    selectedDate,
    calendarYear,
    selectedStartDate,
    selectedEndDate,
    selectedH3Cell,
    selectedCountry,
    selectedSensor,
    minBurnIndex,
    maxBurnIndex,
    setSelectedDate,
    setDateRange,
    setSelectedYear,
    setSelectedH3Cell,
    setSelectedCountry,
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
