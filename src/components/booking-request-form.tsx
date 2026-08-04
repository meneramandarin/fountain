"use client";

import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  MapPin,
  Plus,
  X,
} from "lucide-react";
import Link from "next/link";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type FormEvent,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  BOOKING_MIN_LEAD_DAYS,
  BOOKING_PREFERENCE_COUNT,
  BOOKING_TIME_BUCKETS,
  type BookingService,
  type BookingTimeBucket,
  shouldShowBookingTotal,
} from "@/lib/booking-request";
export type BookableService = BookingService & {
  category: string | null;
  priceContext: string | null;
};

type BookingRequestFormProps = {
  locationId: number;
  locationSlug?: string | null;
  locationName: string;
  locationAddress?: string | null;
  clinicTimezone?: string | null;
  services: BookableService[];
};

type Preference = {
  date: string;
  time: BookingTimeBucket | "";
};

type BookingStep = "services" | "availability" | "details" | "success";

const EMPTY_PREFERENCES: Preference[] = Array.from(
  { length: BOOKING_PREFERENCE_COUNT },
  () => ({ date: "", time: "" }),
);

export function BookingRequestForm({
  locationId,
  locationSlug,
  locationName,
  locationAddress,
  clinicTimezone,
  services,
}: BookingRequestFormProps) {
  const dialogTitleId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [step, setStep] = useState<BookingStep>("services");
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [preferences, setPreferences] =
    useState<Preference[]>(EMPTY_PREFERENCES);
  const [visiblePreferenceCount, setVisiblePreferenceCount] = useState(1);
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [message, setMessage] = useState("");

  const availableServices = useMemo(
    () =>
      services.length
        ? services
        : [
            {
              serviceId: "general-appointment",
              name: "General appointment",
              category: null,
              priceAmount: null,
              priceMaxAmount: null,
              priceCurrency: null,
              priceContext: null,
            },
          ],
    [services],
  );
  const selectedServices = availableServices.filter((service) =>
    selectedServiceIds.includes(service.serviceId),
  );
  const visiblePreferences = preferences.slice(0, visiblePreferenceCount);
  const completedPreferences = visiblePreferences.filter(
    (preference): preference is { date: string; time: BookingTimeBucket } =>
      Boolean(preference.date && preference.time),
  );
  const availabilityReady = Boolean(preferences[0]?.date && preferences[0]?.time);
  function toggleService(serviceId: string) {
    setSelectedServiceIds((current) =>
      current.includes(serviceId)
        ? current.filter((id) => id !== serviceId)
        : [...current, serviceId],
    );
    setMessage("");
  }

  function updatePreference(
    index: number,
    key: keyof Preference,
    value: string,
  ) {
    setPreferences((current) =>
      current.map((preference, preferenceIndex) =>
        preferenceIndex === index
          ? { ...preference, [key]: value }
          : preference,
      ),
    );
    setMessage("");
  }

  function addPreference() {
    setVisiblePreferenceCount((current) => Math.min(current + 1, BOOKING_PREFERENCE_COUNT));
    setMessage("");
  }

  function removePreference(index: number) {
    if (index < 1) return;
    setPreferences((current) => {
      const visible = current.slice(0, visiblePreferenceCount);
      visible.splice(index, 1);
      return [
        ...visible,
        ...Array.from(
          { length: BOOKING_PREFERENCE_COUNT - visible.length },
          () => ({ date: "", time: "" as const }),
        ),
      ];
    });
    setVisiblePreferenceCount((current) => Math.max(1, current - 1));
    setMessage("");
  }

  function continueFlow() {
    setMessage("");
    if (step === "services") {
      if (!selectedServices.length) {
        setMessage("Select at least one treatment to continue.");
        return;
      }
      setStep("availability");
      return;
    }
    if (step === "availability") {
      if (!availabilityReady) {
        setMessage("Complete your first date and time option.");
        return;
      }
      if (
        new Set(completedPreferences.map((preference) => preference.date)).size !==
        completedPreferences.length
      ) {
        setMessage("Please choose a different day for each option.");
        return;
      }
      setStep("details");
      return;
    }
    if (step === "details") {
      formRef.current?.requestSubmit();
    }
  }

  function previousStep() {
    setMessage("");
    if (step === "details") {
      setStep("availability");
    } else if (step === "availability") {
      setStep("services");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step !== "details") {
      return;
    }
    setStatus("submitting");
    setMessage("");

    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/bookings/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationId,
          locationSlug: locationSlug || null,
          locationName,
          name: form.get("name"),
          email: form.get("email"),
          phone: form.get("phone"),
          website: form.get("website"),
          services: selectedServices.map(
            ({
              serviceId,
              name,
              priceAmount,
              priceMaxAmount,
              priceCurrency,
            }) => ({
              serviceId,
              name,
              priceAmount,
              priceMaxAmount,
              priceCurrency,
            }),
          ),
          preferences: completedPreferences,
          timezone:
            Intl.DateTimeFormat().resolvedOptions().timeZone ||
            "Unknown time zone",
          sourcePath: `${window.location.pathname}${window.location.search}`,
        }),
      });
      const result = (await response.json().catch(() => null)) as {
        message?: string;
        error?: string;
      } | null;

      if (!response.ok) {
        throw new Error(
          result?.error ||
            "We couldn’t submit your request. Please try again.",
        );
      }

      setStatus("idle");
      setMessage(
        result?.message ||
          "We’ve received your request and will email you after it’s confirmed.",
      );
      setStep("success");
      window.gtag?.("event", "booking_request_submitted", {
        location_id: locationId,
        location_slug: locationSlug || String(locationId),
        treatment_count: selectedServices.length,
      });
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "We couldn’t submit your request. Please try again.",
      );
    }
  }

  return (
    <section
      className="booking-page-section"
      id="book-appointment"
      aria-labelledby={dialogTitleId}
    >
      <div className="booking-modal">
        <form ref={formRef} onSubmit={submit}>
              <div className={`booking-workspace booking-step-${step}${step === "success" ? " is-success" : ""}`}>
                <main className="booking-step-content">
                  {step !== "success" ? <BookingStepIndicator step={step} /> : null}
                  {step === "services" ? (
                    <ServiceSelection
                      dialogTitleId={dialogTitleId}
                      selectedServiceIds={selectedServiceIds}
                      services={availableServices}
                      onToggle={toggleService}
                    />
                  ) : null}
                  {step === "availability" ? (
                    <AvailabilitySelection
                      dialogTitleId={dialogTitleId}
                      clinicTimezone={clinicTimezone}
                      preferences={visiblePreferences}
                      selectedDates={visiblePreferences
                        .map((preference) => preference.date)
                        .filter(Boolean)}
                      canAdd={visiblePreferenceCount < BOOKING_PREFERENCE_COUNT}
                      onAdd={addPreference}
                      onChange={updatePreference}
                      onRemove={removePreference}
                    />
                  ) : null}
                  {step === "details" ? (
                    <ContactDetails dialogTitleId={dialogTitleId} />
                  ) : null}
                  {step === "success" ? (
                    <SuccessState
                      dialogTitleId={dialogTitleId}
                      message={message}
                      onClose={() => {
                        setSelectedServiceIds([]);
                        setPreferences(EMPTY_PREFERENCES);
                        setVisiblePreferenceCount(1);
                        setMessage("");
                        setStep("services");
                      }}
                    />
                  ) : null}
                </main>

                {step !== "success" ? (
                  <BookingSummary
                    locationName={locationName}
                    locationAddress={locationAddress}
                    message={message}
                    canContinue={
                      step === "services"
                        ? selectedServices.length > 0
                        : step === "availability"
                          ? availabilityReady
                          : true
                    }
                    selectedServices={selectedServices}
                    status={status}
                    step={step}
                    onContinue={continueFlow}
                    onPrevious={previousStep}
                  />
                ) : null}
              </div>

          <label className="booking-honeypot" aria-hidden="true">
            <span>Website</span>
            <input
              autoComplete="off"
              name="website"
              tabIndex={-1}
              type="text"
            />
          </label>
        </form>
      </div>
    </section>
  );
}

function ServiceSelection({
  dialogTitleId,
  selectedServiceIds,
  services,
  onToggle,
}: {
  dialogTitleId: string;
  selectedServiceIds: string[];
  services: BookableService[];
  onToggle: (serviceId: string) => void;
}) {
  const [showAllServices, setShowAllServices] = useState(false);
  const visibleServices = showAllServices ? services : services.slice(0, 4);

  return (
    <>
      <div className="booking-step-heading">
        <h2 className="booking-treatment-heading" id={dialogTitleId}>Select treatments</h2>
      </div>
      <div className="booking-service-list">
        {visibleServices.map((service) => {
          const selected = selectedServiceIds.includes(service.serviceId);
          return (
            <article
              className={`booking-service-card${selected ? " is-selected" : ""}`}
              key={service.serviceId}
            >
              <button
                className="booking-service-main"
                type="button"
                aria-pressed={selected}
                onClick={() => onToggle(service.serviceId)}
              >
                <span>
                  <b>{service.name}</b>
                  {service.priceContext ? (
                    <small>{service.priceContext}</small>
                  ) : null}
                </span>
                <span className="booking-service-action">
                  <strong>{formatServicePrice(service)}</strong>
                  <i>
                    {selected ? (
                      <>
                        <Check size={15} aria-hidden="true" />
                        Added
                      </>
                    ) : (
                      <>
                        <Plus size={15} aria-hidden="true" />
                        Book
                      </>
                    )}
                  </i>
                </span>
              </button>
            </article>
          );
        })}
      </div>
      {!showAllServices && services.length > 4 ? (
        <button
          className="booking-see-all"
          type="button"
          onClick={() => setShowAllServices(true)}
        >
          See all
        </button>
      ) : null}
    </>
  );
}

const BOOKING_STEPS: Array<{ key: Exclude<BookingStep, "success">; label: string }> = [
  { key: "services", label: "Treatments" },
  { key: "availability", label: "Availability" },
  { key: "details", label: "Your details" },
];

function BookingStepIndicator({ step }: { step: Exclude<BookingStep, "success"> }) {
  const stepIndex = BOOKING_STEPS.findIndex((entry) => entry.key === step);
  const current = BOOKING_STEPS[stepIndex] ?? BOOKING_STEPS[0];
  return (
    <div
      className="booking-step-indicator"
      aria-label={`Step ${stepIndex + 1} of ${BOOKING_STEPS.length}: ${current.label}`}
    >
      <span>{stepIndex + 1}</span>
      <small>Step {stepIndex + 1} of {BOOKING_STEPS.length}</small>
    </div>
  );
}

function AvailabilitySelection({
  clinicTimezone,
  dialogTitleId,
  preferences,
  selectedDates,
  canAdd,
  onAdd,
  onChange,
  onRemove,
}: {
  clinicTimezone?: string | null;
  dialogTitleId: string;
  preferences: Preference[];
  selectedDates: string[];
  canAdd: boolean;
  onAdd: () => void;
  onChange: (index: number, key: keyof Preference, value: string) => void;
  onRemove: (index: number) => void;
}) {
  const dateGroups = useMemo(() => groupBookingDates(nextBookingDates()), []);
  return (
    <>
      <div className="booking-step-heading">
        <h2 id={dialogTitleId}>Select date and time</h2>
        <p>
          We don’t have the clinic’s live calendar yet. Give us a few options
          and we’ll confirm one with the clinic.
        </p>
      </div>
      <div className="booking-option-list">
        {preferences.map((preference, index) => (
          <fieldset className="booking-option-card" key={index}>
            <legend>
              <i>{index + 1}</i>
              {ordinal(index + 1)} preference
            </legend>
            {index > 0 ? (
              <button
                className="booking-option-remove"
                type="button"
                onClick={() => onRemove(index)}
                aria-label={`Remove ${ordinal(index + 1).toLowerCase()} preference`}
              >
                <X size={13} aria-hidden="true" />
                Remove
              </button>
            ) : null}
            <div className="booking-preference-control">
              <span className="booking-preference-label">
                <CalendarDays size={15} aria-hidden="true" />
                Date
              </span>
              <div
                className="booking-date-picker"
                role="radiogroup"
                aria-label={`${ordinal(index + 1)} preference date`}
                onKeyDown={moveChoiceFocus}
              >
                {dateGroups.map((group) => (
                  <div className="booking-date-month" key={group.label}>
                    <span>{group.label}</span>
                    <div>
                      {group.options.map((option) => {
                        const selectedElsewhere = selectedDates.some(
                          (date) => date === option.value && date !== preference.date,
                        );
                        const disabled = option.disabled || selectedElsewhere;
                        return (
                          <button
                            className={preference.date === option.value ? "is-selected" : ""}
                            type="button"
                            role="radio"
                            aria-checked={preference.date === option.value}
                            aria-label={option.ariaLabel}
                            disabled={disabled}
                            key={option.value}
                            onClick={() => onChange(index, "date", option.value)}
                          >
                            <small>{option.weekday}</small>
                            <strong>{option.day}</strong>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="booking-preference-control">
              <span className="booking-preference-label">
                <Clock3 size={15} aria-hidden="true" />
                Preferred time
              </span>
              <div
                className="booking-time-options"
                role="radiogroup"
                aria-label={`${ordinal(index + 1)} preference time`}
                onKeyDown={moveChoiceFocus}
              >
                {BOOKING_TIME_BUCKETS.map((bucket) => (
                  <button
                    className={preference.time === bucket ? "is-selected" : ""}
                    type="button"
                    role="radio"
                    aria-checked={preference.time === bucket}
                    key={bucket}
                    onClick={() => onChange(index, "time", bucket)}
                  >
                    <strong>{timeBucketLabel(bucket)}</strong>
                    <small>{timeBucketRange(bucket)}</small>
                  </button>
                ))}
              </div>
              <small className="booking-timezone-note">{clinicTimezoneCaption(clinicTimezone)}</small>
            </div>
          </fieldset>
        ))}
      </div>
      {canAdd ? (
        <button className="booking-add-option" type="button" onClick={onAdd}>
          <Plus size={14} aria-hidden="true" />
          Add another option
        </button>
      ) : null}
    </>
  );
}

function ContactDetails({ dialogTitleId }: { dialogTitleId: string }) {
  return (
    <>
      <div className="booking-step-heading">
        <h2 id={dialogTitleId}>Your details</h2>
        <p>
          We’ll use these details to coordinate your request and send the
          confirmation.
        </p>
      </div>
      <fieldset className="booking-details-fields">
        <legend>Contact information</legend>
        <label>
          <span>Full name</span>
          <input
            autoComplete="name"
            name="name"
            type="text"
            maxLength={120}
            placeholder="Your name"
            required
          />
        </label>
        <label>
          <span>Email address</span>
          <input
            autoComplete="email"
            inputMode="email"
            name="email"
            type="email"
            maxLength={254}
            placeholder="you@example.com"
            required
          />
        </label>
        <label>
          <span>
            Phone number <small>Optional</small>
          </span>
          <input
            autoComplete="tel"
            inputMode="tel"
            name="phone"
            type="tel"
            maxLength={40}
            placeholder="+1 555 000 0000"
          />
        </label>
      </fieldset>
      <p className="booking-details-note">
        Your appointment is only confirmed after you receive our confirmation
        email. By submitting, you agree to Fountain’s{" "}
        <Link href="/privacy-policy">Privacy Policy</Link>.
      </p>
    </>
  );
}

function BookingSummary({
  canContinue,
  locationName,
  locationAddress,
  message,
  selectedServices,
  status,
  step,
  onContinue,
  onPrevious,
}: {
  canContinue: boolean;
  locationName: string;
  locationAddress?: string | null;
  message: string;
  selectedServices: BookableService[];
  status: "idle" | "submitting" | "error";
  step: Exclude<BookingStep, "success">;
  onContinue: () => void;
  onPrevious: () => void;
}) {
  const total = serviceTotal(selectedServices);
  const showTotal = shouldShowBookingTotal(selectedServices);
  return (
    <aside className="booking-summary">
      <div className="booking-summary-clinic">
        <span>Booking request for</span>
        <h3>{locationName}</h3>
        {locationAddress ? (
          <div className="booking-summary-facts">
            <span>
              <MapPin size={14} aria-hidden="true" />
              {locationAddress}
            </span>
          </div>
        ) : null}
      </div>
      <div className="booking-summary-services">
        <div>
          <h4>Selected treatments</h4>
          <small>{selectedServices.length || "None yet"}</small>
        </div>
        {selectedServices.length ? (
          <ul>
            {selectedServices.map((service) => (
              <li key={service.serviceId}>
                <span>{service.name}</span>
                <b>{formatServicePrice(service, false)}</b>
              </li>
            ))}
          </ul>
        ) : (
          <p>Your selected treatments will appear here.</p>
        )}
      </div>
      {showTotal ? (
        <div className="booking-summary-total">
          <span>
            <b>{total.label}</b>
            {total.note ? <small>{total.note}</small> : null}
          </span>
          <strong>{total.value}</strong>
        </div>
      ) : null}
      <div className="booking-summary-actions">
        {message ? (
          <p className="booking-request-error" role="alert">
            {message}
          </p>
        ) : null}
        <button
          className="booking-continue"
          type="button"
          disabled={status === "submitting" || !canContinue}
          onClick={onContinue}
        >
          {status === "submitting" ? (
            <LoaderCircle
              className="booking-request-spinner"
              size={17}
              aria-hidden="true"
            />
          ) : null}
          {status === "submitting"
            ? "Sending request…"
            : step === "details"
              ? "Send booking request"
              : "Continue"}
          {status !== "submitting" ? (
            <ArrowRight size={17} aria-hidden="true" />
          ) : null}
        </button>
        {step !== "services" ? (
          <button
            className="booking-back"
            type="button"
            disabled={status === "submitting"}
            onClick={onPrevious}
          >
            <ArrowLeft size={15} aria-hidden="true" />
            Back
          </button>
        ) : null}
      </div>
    </aside>
  );
}

function SuccessState({
  dialogTitleId,
  message,
  onClose,
}: {
  dialogTitleId: string;
  message: string;
  onClose: () => void;
}) {
  return (
    <div className="booking-success-state" role="status">
      <span>
        <CheckCircle2 size={30} aria-hidden="true" />
      </span>
      <h2 id={dialogTitleId}>Your request is in</h2>
      <p>{message}</p>
      <p>
        This isn’t a confirmed appointment yet. We’ll coordinate with the
        clinic and email you as soon as a time is confirmed.
      </p>
      <button type="button" onClick={onClose}>
        Start another request
      </button>
    </div>
  );
}

function formatServicePrice(
  service: Pick<
    BookableService,
    "priceAmount" | "priceMaxAmount" | "priceCurrency"
  >,
  includeFrom = true,
) {
  if (service.priceAmount == null) {
    return "Price on request";
  }
  const currency = service.priceCurrency || "USD";
  const minimum = money(service.priceAmount, currency);
  if (
    service.priceMaxAmount != null &&
    service.priceMaxAmount !== service.priceAmount
  ) {
    return `${minimum}–${money(service.priceMaxAmount, currency)}`;
  }
  return includeFrom ? `From ${minimum}` : minimum;
}

function serviceTotal(services: BookableService[]) {
  if (!services.length) {
    return { label: "Estimated total", value: "—", note: null };
  }
  const priced = services.filter((service) => service.priceAmount != null);
  if (!priced.length) {
    return {
      label: "Estimated total",
      value: "Price on request",
      note: "The clinic will confirm pricing",
    };
  }
  const currencies = new Set(
    priced.map((service) => service.priceCurrency || "USD"),
  );
  if (currencies.size > 1) {
    return {
      label: "Estimated total",
      value: "See prices above",
      note: "Multiple currencies",
    };
  }
  const currency = [...currencies][0];
  const amount = priced.reduce(
    (sum, service) => sum + (service.priceAmount || 0),
    0,
  );
  const hasUnpriced = priced.length !== services.length;
  return {
    label: hasUnpriced ? "Priced subtotal" : "Estimated total",
    value: `${hasUnpriced ? "From " : ""}${money(amount, currency)}`,
    note: hasUnpriced ? "Some prices will be confirmed by the clinic" : null,
  };
}

function money(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

function ordinal(value: number) {
  return value === 1 ? "First" : value === 2 ? "Second" : "Third";
}

type BookingDateOption = {
  ariaLabel: string;
  day: string;
  disabled: boolean;
  month: string;
  value: string;
  weekday: string;
};

type BookingDateGroup = {
  label: string;
  options: BookingDateOption[];
};

function nextBookingDates(now = new Date()): BookingDateOption[] {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekdayFormatter = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
  });
  const monthFormatter = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  });
  const labelFormatter = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return Array.from({ length: 21 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      ariaLabel: `${labelFormatter.format(date)}${
        index < BOOKING_MIN_LEAD_DAYS
          ? ", unavailable because bookings require 48 hours notice"
          : ""
      }`,
      day: String(date.getDate()),
      disabled: index < BOOKING_MIN_LEAD_DAYS,
      month: monthFormatter.format(date),
      value: localDateValue(date),
      weekday: weekdayFormatter.format(date),
    };
  });
}

function groupBookingDates(options: BookingDateOption[]): BookingDateGroup[] {
  return options.reduce<BookingDateGroup[]>((groups, option) => {
    const current = groups.at(-1);
    if (!current || current.label !== option.month) {
      groups.push({ label: option.month, options: [option] });
    } else {
      current.options.push(option);
    }
    return groups;
  }, []);
}

function localDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function timeBucketLabel(bucket: BookingTimeBucket) {
  return bucket === "morning"
    ? "Morning"
    : bucket === "afternoon"
      ? "Afternoon"
      : "Evening";
}

function timeBucketRange(bucket: BookingTimeBucket) {
  return bucket === "morning"
    ? "9am–12pm"
    : bucket === "afternoon"
      ? "12–4pm"
      : "4–8pm";
}

function clinicTimezoneCaption(timezone?: string | null) {
  if (!timezone) {
    return "Times are shown in the clinic’s local timezone.";
  }

  try {
    const timezoneName = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      timeZoneName: "long",
    })
      .formatToParts(new Date())
      .find((part) => part.type === "timeZoneName")?.value;
    return `Times are shown in ${timezoneName || timezone}, the clinic’s local timezone.`;
  } catch {
    return "Times are shown in the clinic’s local timezone.";
  }
}

function moveChoiceFocus(event: ReactKeyboardEvent<HTMLDivElement>) {
  const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"];
  if (!keys.includes(event.key)) return;

  const choices = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>(
      'button[role="radio"]:not(:disabled)',
    ),
  );
  if (!choices.length) return;

  event.preventDefault();
  const currentIndex = Math.max(0, choices.indexOf(document.activeElement as HTMLButtonElement));
  const nextIndex =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? choices.length - 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? (currentIndex - 1 + choices.length) % choices.length
          : (currentIndex + 1) % choices.length;
  choices[nextIndex]?.focus();
}
