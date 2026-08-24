import { rn } from "./numberUtils.js";

export * from "./arrayUtils.js";
export * from "./graphUtils.js";
export * from "./numberUtils.js";
export * from "./path.js";
export * from "./sphereMath.js";
export * from "./probability.js";

/**
 * Round all numbers in a string to d decimal places
 * @param {string} inputString - The input string
 * @param {number} decimals - Number of decimal places (default is 1)
 * @returns {string} - The string with rounded numbers
 */
export const round = (inputString = "", decimals = 1) => {
  return inputString.replace(/[\d.-][\d.e-]*/g, n => {
    return rn(parseFloat(n), decimals).toString();
  });
};
