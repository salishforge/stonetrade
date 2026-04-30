// Lore Mythics — the cards earning the 3x Dragon Cup multiplier per the
// PDF slide 7 footnote. Per the PDF, Stoneseekers are also covered by the
// 3x rule; that list lives separately on the platform side and is applied
// via Card.isStoneseeker.
//
// The list is intentionally an in-repo manifest rather than a platform
// API field so it can be edited independently of the upstream catalog
// (the lore designation is collector-side, not gameplay state).
//
// Sourced from the official Dragon Cup announcement; "tentative" per the
// announcement, so expect occasional churn. Update + re-sync to refresh.

export const WOTF_LORE_MYTHICS: ReadonlyArray<{ setCode: string; name: string }> = [
  // Existence (EX1)
  { setCode: "EX1", name: "Emma \"Fixem\" Shockbite" },
  { setCode: "EX1", name: "Phoenix Quill" },
  { setCode: "EX1", name: "The Blazing Phoenix Pub" },
  { setCode: "EX1", name: "Drogothar the Destroyer" },
  { setCode: "EX1", name: "The Prisoner" },

  // Call of the Stones (CotS)
  { setCode: "CotS", name: "Letter From a Friend" },
  { setCode: "CotS", name: "Vaylen Vos" },
  { setCode: "CotS", name: "Kaia \"Clutch\" Shockbite" },
  { setCode: "CotS", name: "Heatseeker" },
  { setCode: "CotS", name: "Galaxy Slayer" },
  { setCode: "CotS", name: "Quantrus the Relentless" },
  { setCode: "CotS", name: "Sparktail the Lightning Ferret" },
  { setCode: "CotS", name: "Roman Silvershot" },
  { setCode: "CotS", name: "Drajjor Bonelock" },
  { setCode: "CotS", name: "Vincent Varok" },
  { setCode: "CotS", name: "Xander Cloudwright" },
  { setCode: "CotS", name: "Lord Khareth Duskwane" },
  // "all Formless Stones" — six per orbital
  { setCode: "CotS", name: "Boundless Formless Stone" },
  { setCode: "CotS", name: "Heliosynth Formless Stone" },
  { setCode: "CotS", name: "Petraian Formless Stone" },
  { setCode: "CotS", name: "Solferian Formless Stone" },
  { setCode: "CotS", name: "Thalwindian Sea Formless Stone" },
  { setCode: "CotS", name: "Umbrathean Formless Stone" },
];

const _LORE_KEYS = new Set(
  WOTF_LORE_MYTHICS.map((c) => `${c.setCode}::${c.name}`),
);

/** True when the (setCode, cardName) pair is a registered Lore Mythic. */
export function isLoreMythicCard(setCode: string, cardName: string): boolean {
  return _LORE_KEYS.has(`${setCode}::${cardName}`);
}
