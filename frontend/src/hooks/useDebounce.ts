import { useState, useEffect } from 'react';

/**
 * A custom hook that returns a debounced version of the provided value.
 * Useful for delaying API calls or expensive operations until the user stops typing.
 * 
 * @param value The value to debounce.
 * @param delay The delay in milliseconds (default: 500).
 * @returns The debounced value.
 */
export function useDebounce<T>(value: T, delay: number = 500): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    // Set debouncedValue to value (passed in) after the specified delay
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // Cancel the timeout if value changes (also on delay change or unmount)
    // This is how we prevent debounced value from updating if value is changed
    // within the delay period. Timeout gets cleared and restarted.
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}
