export function computeMedian(values: number[]): number | undefined {
  if (values.length === 0) {
    return undefined;
  }

  const sortedValues = [...values].sort((left, right) => left - right);
  const middleIndex = Math.floor(sortedValues.length / 2);

  if (sortedValues.length % 2 === 0) {
    return (sortedValues[middleIndex - 1] + sortedValues[middleIndex]) / 2;
  }

  return sortedValues[middleIndex];
}

export function average(values: number[]): number | undefined {
  if (values.length === 0) {
    return undefined;
  }

  const sum = values.reduce((accumulator, value) => accumulator + value, 0);
  return sum / values.length;
}

export function computeCostPerCorrectAnswer(
  correctCount: number,
  totalTokenValues: number[],
): number | undefined {
  if (correctCount === 0 || totalTokenValues.length === 0) {
    return undefined;
  }

  const totalTokenCount = totalTokenValues.reduce(
    (accumulator, value) => accumulator + value,
    0,
  );
  return totalTokenCount / correctCount;
}
