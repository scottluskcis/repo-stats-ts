/**
 * Test utilities for mocking and helper functions used across test files
 */

/**
 * Executes a function with a mocked Date object
 * Restores the original Date after execution to prevent test pollution
 * 
 * @param mockDate The date to use during test execution
 * @param testFn The function to execute with the mocked date
 */
export function withMockedDate(mockDate: Date, testFn: () => void): void {
  const originalDate = global.Date;
  try {
    // Replace the global Date with our mocked version
    global.Date = class extends Date {
      constructor() {
        super();
        return mockDate;
      }
      static now() {
        return mockDate.getTime();
      }
    } as any;
    
    // Execute the test function with our mocked Date
    testFn();
  } finally {
    // Always restore the original Date to prevent test pollution
    global.Date = originalDate;
  }
}

/**
 * Creates a simple mock logger object that can be used in tests
 * 
 * @returns A mock logger with jest spy functions
 */
export function createMockLogger() {
  return {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}