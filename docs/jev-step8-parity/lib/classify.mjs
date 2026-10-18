export const UNCERTAIN_LOW = 0.2;
export const UNCERTAIN_HIGH = 0.8;

export const classify = probability => {
  if (typeof probability !== 'number'
    || !Number.isFinite(probability)
    || probability < 0
    || probability > 1) {
    return 'invalid';
  }

  if (probability > UNCERTAIN_HIGH) return 'yes';
  if (probability < UNCERTAIN_LOW) return 'no';
  return 'uncertain';
};

export const toVerdict = (probability, polarity) => {
  if (polarity !== 'yes_is_pass' && polarity !== 'yes_is_defect') {
    throw new TypeError(`Unknown polarity: ${polarity}`);
  }

  const classification = classify(probability);
  if (classification === 'uncertain' || classification === 'invalid') return classification;

  const yesMeansPass = polarity === 'yes_is_pass';
  return (classification === 'yes') === yesMeansPass ? 'pass' : 'defect';
};
