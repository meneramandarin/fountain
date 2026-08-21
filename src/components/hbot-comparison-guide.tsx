import styles from "@/components/hbot-comparison-guide.module.css";

const comparisonDimensions = [
  {
    title: "Clinical setting",
    description: "Separate hospital and wound-care programs from recovery or wellness providers.",
  },
  {
    title: "Chamber and pressure",
    description: "Ask what chamber is used, whether it is hard-sided or fabric, and what pressure the session reaches.",
  },
  {
    title: "Screening and oversight",
    description: "Check whether medical clearance is required and who supervises treatment on site.",
  },
  {
    title: "Total treatment cost",
    description: "Compare session length, consultation fees, single-session pricing, and package requirements.",
  },
] as const;

export function HbotComparisonGuide() {
  return (
    <aside className={styles.guide} aria-labelledby="hbot-comparison-title">
      <p className={styles.eyebrow}>Before choosing a provider</p>
      <h2 id="hbot-comparison-title">Compare Miami HBOT providers beyond price</h2>
      <p className={styles.intro}>
        Hyperbaric services are not interchangeable. Use each provider&apos;s profile and source links
        to verify the setting, equipment, supervision, session format, and complete price before
        contacting the clinic.
      </p>
      <ul className={styles.dimensions}>
        {comparisonDimensions.map((dimension) => (
          <li key={dimension.title}>
            <strong>{dimension.title}</strong>
            {dimension.description}
          </li>
        ))}
      </ul>
      <p className={styles.note}>
        Fountain does not rank providers or give medical advice. Confirm treatment details directly
        with the provider. Read the{" "}
        <a
          href="https://www.fda.gov/medical-devices/letters-health-care-providers/follow-instructions-safe-use-hyperbaric-oxygen-therapy-devices-letter-health-care-providers"
          rel="noreferrer"
          target="_blank"
        >
          FDA&apos;s HBOT device safety guidance
        </a>{" "}
        and the{" "}
        <a
          href="https://uhms.org/images/Position-Statements/UHMS_Position_Statement_LP_chambers_revised.pdf"
          rel="noreferrer"
          target="_blank"
        >
          UHMS statement on low-pressure fabric chambers
        </a>.
      </p>
    </aside>
  );
}
