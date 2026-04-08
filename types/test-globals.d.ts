// Project-wide test and bench global declarations to help the type-checker
declare function waitForNextEvaluation(): Promise<void>;
declare function createIsland(...args: any[]): any;
declare function createSPA(...args: any[]): any;
declare function hydrateSPA(...args: any[]): any;
declare function route(...args: any[]): any;
declare function getRoutes(): any;
declare const vi: any;
// Allow importing the JSX runtime module path used in tests
declare module '@askrjs/askr/jsx-runtime';
