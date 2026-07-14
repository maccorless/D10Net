import { useRef, useState } from "react";
import type { Board } from "@daily/contracts";

type Candidate = Board["universe"][number];
type Props = {
  search(query: string): Candidate[];
  onSelect(id: string): void;
  armed: boolean;
};

const normalize = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

export function SearchPicker({ search, onSelect, armed }: Props) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const needle = normalize(query);
  const suggestions = search(query).sort((a, b) =>
    a.label.localeCompare(b.label),
  );
  return (
    <div className="picker">
      <label htmlFor="answer-search">Guess an answer</label>
      <input
        ref={inputRef}
        id="answer-search"
        type="search"
        value={query}
        autoComplete="off"
        onChange={(event) => setQuery(event.target.value)}
      />
      {suggestions.length > 0 && (
        <ul className="suggestions">
          {suggestions.map((candidate) => {
            const aliasMatch =
              needle.length > 0 && !normalize(candidate.label).includes(needle)
                ? candidate.aliases.find((a) => normalize(a).includes(needle))
                : undefined;
            return (
              <li key={candidate.id}>
                <button
                  className={armed ? "armed" : ""}
                  onClick={() => {
                    onSelect(candidate.id);
                    setQuery("");
                    inputRef.current?.focus();
                  }}
                >
                  <span>
                    {candidate.label}
                    {aliasMatch && (
                      <small style={{ color: "var(--muted)", marginLeft: 4 }}>
                        ({aliasMatch})
                      </small>
                    )}
                  </span>
                  {armed && <small>⓵ +1</small>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
