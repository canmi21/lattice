import data from '../author.json' with { type: 'json' };

/**
 * The author, declared once for every app. The values are a JSON file so that Rust and the
 * scripts outside the Vite graph read the same file. See spec/architecture/identity.md.
 */
export interface Author {
	/** The name a page signs with. */
	name: string;
	/** How the home page and its OpenGraph card introduce the author. Not translated. */
	fullName: string;
	role: string;
	/** A person's address, and the one the feed names as its author. */
	email: string;
	// Handles, not URLs: where each is reached is libs/urls'.
	telegram: string;
	twitter?: string;
	github: string;
	/** GitHub's numeric id, which addresses the avatar and survives a renamed handle. */
	githubId: number;
	fediverse: string;
	/** A domain the owner proves on Bluesky; the site's domain is that proof. */
	bluesky: string;
}

export const author: Readonly<Author> = data;
