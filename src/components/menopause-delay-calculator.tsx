"use client";

import { useMemo, useState } from "react";

const BASELINE_MENOPAUSE_AGE = 51;

function computeDelay(age: number, cortex: number, survival: number, procedures: number) {
  const ageFactor = Math.pow((41 - age) / (41 - 25), 1.15);
  const cortexFactor = cortex / 25;
  const survivalFactor = survival === 40 ? 1 : survival === 80 ? 1.31 : 1.5;
  const procedureFactor = procedures === 1 ? 1 : procedures === 3 ? 1.95 : 2.63;
  const delay = 11.8 * ageFactor * cortexFactor * survivalFactor * procedureFactor;

  return Math.min(Math.max(delay, 0.5), 50);
}

function shownDelay(delay: number) {
  return delay >= 20 ? Math.round(delay).toString() : (Math.round(delay * 10) / 10).toString();
}

export function MenopauseDelayCalculator() {
  const [age, setAge] = useState(30);
  const [cortex, setCortex] = useState(25);
  const [survival, setSurvival] = useState(40);
  const [procedures, setProcedures] = useState(1);

  const delay = useMemo(() => computeDelay(age, cortex, survival, procedures), [age, cortex, survival, procedures]);
  const delayedAge = Math.round(BASELINE_MENOPAUSE_AGE + delay);
  const isBeyondNormalWindow = delay >= 45;

  return (
    <div className="calc-shell">
      <div className="calc-arch">
        <p className="calc-h">The Menopause Delay Calculator</p>
      </div>
      <div className="calc-body">
        <div className="field">
          <div className="field-top">
            <span className="field-label">Age at tissue harvest</span>
            <span className="field-val">{age}</span>
          </div>
          <input
            aria-label="Age at tissue harvest"
            max="40"
            min="21"
            onChange={(event) => setAge(Number(event.target.value))}
            step="1"
            type="range"
            value={age}
          />
          <p className="field-note">Younger tissue holds more follicles. The model spans ages 21 to 40.</p>
        </div>

        <div className="field">
          <div className="field-top">
            <span className="field-label">Ovarian cortex preserved</span>
            <span className="field-val">{cortex}%</span>
          </div>
          <input
            aria-label="Ovarian cortex preserved"
            max="50"
            min="10"
            onChange={(event) => setCortex(Number(event.target.value))}
            step="5"
            type="range"
            value={cortex}
          />
          <p className="field-note">Share of total ovarian cortex removed and frozen. More tissue, more reserve banked.</p>
        </div>

        <div className="field">
          <div className="field-top">
            <span className="field-label">Post-transplant follicle survival</span>
          </div>
          <div className="seg" role="group" aria-label="Post-transplant follicle survival">
            {[
              { value: 40, label: "40% · conservative" },
              { value: 80, label: "80% · modern" },
              { value: 100, label: "100% · ideal" },
            ].map((option) => (
              <button
                className={survival === option.value ? "on" : undefined}
                key={option.value}
                onClick={() => setSurvival(option.value)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="field-note">How much tissue survives regrafting. Better surgical technique pushes this higher.</p>
        </div>

        <div className="field">
          <div className="field-top">
            <span className="field-label">Transplant procedures</span>
          </div>
          <div className="seg" role="group" aria-label="Transplant procedures">
            {[
              { value: 1, label: "One" },
              { value: 3, label: "Three" },
              { value: 6, label: "Six" },
            ].map((option) => (
              <button
                className={procedures === option.value ? "on" : undefined}
                key={option.value}
                onClick={() => setProcedures(option.value)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="field-note">Returning tissue in fractions, rather than all at once, extends the benefit substantially.</p>
        </div>

        <div className="calc-out">
          <p className="calc-out-label">Modeled menopause delay</p>
          <div className="calc-out-num">
            <span>{shownDelay(delay)}</span>
            <small> yrs</small>
          </div>
          <p className="calc-out-sub">
            {isBeyondNormalWindow
              ? "At these settings the model approaches indefinite postponement, menopause pushed beyond the normal lifespan window."
              : `Menopause postponed from an assumed baseline of age ${BASELINE_MENOPAUSE_AGE} to roughly age ${delayedAge}.`}
          </p>
        </div>

        <p className="calc-foot">
          Estimates are illustrative, derived from the published Johnson-Lawley-Emerson-Oktay follicle-wastage
          model (<em>Am J Obstet Gynecol</em>, 2024). Real outcomes depend on individual ovarian reserve, which
          varies across women by an order of magnitude, and on surgical factors. This is not a clinical prediction.
          For the researchers&apos; full tool, see the{" "}
          <a href="https://www.fertilitypreservation.org/contents/probability-calculator/nopauze-calculator" target="_blank" rel="noopener noreferrer">
            NoPauze calculator
          </a>
          .
        </p>
      </div>
    </div>
  );
}
