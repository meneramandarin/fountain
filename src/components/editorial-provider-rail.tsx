import { DirectoryLocationCard, type DirectoryLocationCardData } from "@/components/directory-location-card";
import type { EditorialProviderRail } from "@/lib/editorial-articles";

export function EditorialProviderRail({
  directoryCards = [],
  rail,
}: {
  directoryCards?: DirectoryLocationCardData[];
  rail: EditorialProviderRail;
}) {
  const hasDirectoryCards = directoryCards.length > 0;

  return (
    <div className="rail">
      <div className="rail-inner">
        <p className="rail-title">{rail.title}</p>
        {hasDirectoryCards ? (
          <div className="editorial-directory-card-grid">
            {directoryCards.map((card) => (
              <DirectoryLocationCard from={rail.cardFrom || "article"} key={card.id} result={card} />
            ))}
          </div>
        ) : (
          <div className="cards">
            {(rail.cards || []).map((card) => (
              <a className="card" href={card.href} key={`${card.name}-${card.href}`} target="_blank" rel="noopener noreferrer">
                {card.rating ? <span className="card-rating">{card.rating}</span> : null}
                <span className="card-name">{card.name}</span>
                <span className="card-loc">{card.location}</span>
                <span className="card-tags">
                  {card.tags.map((tag) => (
                    <span className="tag" key={tag}>
                      {tag}
                    </span>
                  ))}
                </span>
              </a>
            ))}
          </div>
        )}
        <p className="rail-cta">
          <a href={rail.cta.href} target="_blank" rel="noopener noreferrer">
            {rail.cta.label}
          </a>
        </p>
      </div>
    </div>
  );
}
