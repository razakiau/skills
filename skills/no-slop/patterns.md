# AI-writing patterns

Strongest first. Patterns 1 to 7 justify an edit on one sighting. A pattern marked *weak alone* needs other tells in the same passage before you act. The structural habits (A, B, F) persist across model releases; the word lists in C drift with each one.

## A. Staging instead of stating

The sentence signals importance instead of adding a fact.

### 1. Not X but Y

**Watch for:** not X but Y; not just, not only, or not merely X, but Y; it's not X, it's Y; the question isn't X, it's Y; X rather than Y; the contrast split across sentences ("This does not mean X. It means Y."); a clipped negative tail ("..., no guessing"); negative listing ("Not a X. Not a Y. A Z."). The same construction in any language counts.
**Problem:** The negative half names something no one claimed, so the positive half sounds larger. State the point directly. Keep a contrast only when the negative half corrects a belief the reader actually holds, or both halves carry information.
**Before:**
> It's not just about the beat riding under the vocals; it's part of the aggression and atmosphere. It's not merely a song, it's a statement.
**After:**
> The heavy beat adds to the aggressive tone.
**Before (split):**
> This does not mean every choice is equal. It means there is no external system that confirms which choice is right.
**After:**
> No external system confirms which choice is right, although the choices still have different consequences.
**Before (question form):**
> The question isn't the model. It's the eval.
**After:**
> The eval matters more than the model.
**Before (clipped tail):**
> The options come from the selected item, no guessing.
**After:**
> The options come from the selected item without forcing the user to guess.

### 2. Closers, kickers, and recaps

**Watch for:** a one-sentence paragraph that restates the one before; "That is the real win."; "That distinction matters."; "Read that again."; "Let that sink in."; "That's it. That's the whole thing."; the same closer after several sections; a line after an example that names what it showed ("This shows the importance of...", "The message was clear:", "It was a lesson in patience."); a final metaphor, aphorism, or mic-drop line; a recap ending ("In conclusion", "Ultimately", "Overall", a last paragraph restating the piece); a row of fragments ("No aesthetic prior. No nostalgia."; "X. And Y. And Z."); one word in ALL CAPS or with periods between words (every. single. day.).
**Problem:** The line asks the reader to pause on a claim instead of adding to it. A short sentence can carry emphasis when it carries a new fact. Delete a kicker; do not rewrite it into a better metaphor or keep its rhythm. End on the last concrete point, takeaway, or next action already in the draft. Merge a row of fragments into one sentence with a specific claim.
**Before:**
> Then AlphaEvolve arrived. It had no preference for symmetry. No aesthetic prior. No nostalgia for human taste. The old rules were gone.
**After:**
> AlphaEvolve changed the search because it did not favor symmetry or human-looking designs. That made some of the older assumptions less useful.
**Before (repeated closer):**
> Caching cuts repeat work.
>
> That is the real win.
>
> Retries hide brief outages.
>
> That is the real win.
**After:**
> Caching cuts repeat work.
>
> Retries hide brief outages.

### 3. Sayings that sound deep

**Watch for:** the real question is, at its core, in reality, what really matters, fundamentally, the deeper issue, the heart of the matter, the reality is, the truth is, X is the Y of Z, X becomes a trap, X is not a tool but a mirror, the language of, the currency of, the architecture of
**Problem:** An ordinary point is dressed as a hidden truth or an aphorism. Replace the saying with the specific claim.
**Before:**
> Symmetry is the language of trust. Efficiency becomes a trap when teams forget the human layer.
**After:**
> Symmetric layouts often feel more predictable to users. Teams can over-optimize workflows and miss how people actually use them.

### 4. Staged run-up and rhetorical setups

**Watch for:** Let's dive in, let's explore, let's break this down, here's what you need to know, now let's look at, without further ado, heads up, quick note, Honestly?, Look, Here's the thing, Here's what I mean, The thing is, Let me be clear, I'll be honest, Let's be honest, Real talk, The uncomfortable truth is, What if I told you, Think about it:, Plot twist:, a self-answered "Question? Answer." pair
**Problem:** The writer announces the point, stages candor, or asks a question only to answer it, instead of making the point. Remove the run-up, not just its tone. "Honestly" or "look" inside a casual sentence is ordinary; the tell is the standalone opener before a routine claim.
**Before:**
> Is it worth the price? Honestly? It depends on how often you'll use it.
**After:**
> Whether it's worth the price depends on how often you'll use it.

### 5. Faux insight and colon reveals

**Watch for:** This is the part most people skip, What most people get wrong, Here's what nobody tells you, The part everyone misses; a noun phrase, a colon, then a dramatic reveal ("The detail that makes it work: a separate agent grades it." "The best part: it learns.")
**Problem:** The setup casts the writer as the lone expert and the colon stages a reveal. Cut the setup and let the claim stand. Use colons for lists, labels, and quotes. After a colon, use sentence case unless grammar, a proper noun, a title, or code says otherwise.
**Before:**
> The part everyone misses: distribution is the real moat.
**After:**
> Distribution is the moat.
**Before (colon reveal):**
> The detail that makes it work: a separate agent grades it.
**After:**
> A separate agent does the grading, which is what makes it work.

### 6. Telling the reader what to notice

**Watch for:** That last part matters more than it sounds, The key point is, As you can see, It's worth noting, It's important to note, Importantly, Crucially, Interestingly, Surprisingly, a redundant "In other words"
**Problem:** The text steps outside its subject to say what is important, surprising, or obvious instead of showing why. If the facts around it already show the point, delete the aside. Otherwise replace it with the fact that carries the weight.
**Before:**
> It's worth noting that the cache is per region. That last part matters more than it sounds.
**After:**
> The cache is per region, so a user who travels starts cold.
(Only if the source says so. Otherwise just: "The cache is per region.")

### 7. Arguing with no one

**Watch for:** This isn't (mainly) about, I'm not saying, To be clear, Don't get me wrong, This is not to say, Some might say... but, A tempting approach would be, One might be tempted to, You might think... but, It would be easy to just
**Problem:** The text answers an objection or rejects an option that appears nowhere else, usually a leftover from an earlier draft. Remove the defense; if it holds a real claim, state the claim. Keep an objection the text attributes or answers in full, and an option a reader would actually weigh.
**Before:**
> Session tokens are rotated every 24 hours. A tempting approach would be to rotate them by restarting the auth service on a cron job, but that would drop every active session. Rotation happens in place, and clients refresh transparently.
**After:**
> Session tokens are rotated every 24 hours, in place, and clients refresh transparently.

## B. Rhythm by rule

Shapes and punctuation applied everywhere, whether or not the meaning asks for them.

### 8. Forced triads

**Problem:** Ideas arrive in threes to sound complete. The tell can be one sentence ("innovation, inspiration, and insights"), three parallel examples, or three short facts followed by a lesson. Check that each item adds a distinct idea; merge, develop the strongest, or vary the structure. Keep three real items when the meaning has three.
**Before:**
> The event features keynote sessions, panel discussions, and networking opportunities. Attendees can expect innovation, inspiration, and industry insights.
**After:**
> The event includes talks and panels. There's also time for informal networking between sessions.

### 9. Repeated shapes

**Problem:** Several sentences in a row start with the same subject, or every paragraph has the same shape (claim, example, lesson), because rhythm is handled by rule. Merge sentences, change the subject, start with the action, or vary the paragraph. Writers repeat on purpose sometimes ("She came. She saw. She conquered.").
**Before:**
> She noted the door. She noted the lock on it. She filed both away.
**After:**
> She noted the door and its lock, then filed both away.

### 10. Synonym cycling

**Problem:** One thing gets a new name in each sentence to avoid repetition, so the reader wonders whether there are three things. If the clear word is right, repeat it.
**Before:**
> The agent reviews the draft. The assistant scores the piece. The tool suggests fixes.
**After:**
> The agent reviews the draft, scores it, and suggests fixes.

### 11. Dashes as the universal connector

**Rule:** See the dash rule in SKILL.md. Replace each dash with a period, comma, colon, or parentheses, or rewrite the sentence.
**Problem:** A dash lets the writer skip deciding how two clauses relate. Editors and journalists use dashes too, so one dash is *weak alone*; a text full of them is not.
**Before:**
> The new policy — announced without warning — affects thousands of workers.
**After:**
> The new policy, announced without warning, affects thousands of workers.

### 12. Stacked qualifiers

**Watch for:** to be fair, it's also possible, could potentially, might arguably, in some cases it may
**Problem:** Qualifier after qualifier until every claim sounds uncertain, usually repairing an earlier overstatement. Keep a qualifier when the source supports it and the meaning needs it; keep scope statements, legal and safety notices, and hedges that carry real doubt. *Weak alone.*
**Before:**
> It could potentially possibly be argued that the policy might have some effect on outcomes.
**After:**
> The policy may affect outcomes.

### 13. Hyphenated pairs everywhere

**Problem:** Compound modifiers keep their hyphen after the noun. `a high-quality report`, but `the report is high quality`. Words the dictionary always hyphenates (third-party, cross-functional) keep it. *Weak alone.*

### 14. Passive voice and missing subjects

**Problem:** The text hides who acts, drops the subject, or gives a human verb to a thing ("the decision emerged"). Name the actor. *Weak alone.*
**Before:**
> No configuration file needed. The results are preserved automatically.
**After:**
> You do not need a configuration file. The system preserves the results automatically.

## C. Inflation and borrowed authority

The fact underneath is usually sound. Keep it and remove the dressing.

### 15. AI words and empty phrases

**Cut on sight:** actually (as an opener), additionally, align with, beacon, bolstered, crucial, cutting-edge, deep dive, delve, elevate, embark, empower, enduring, enhance, ever-evolving, facilitate, foster, game changer, garner, harness, highlight (verb), interplay, intricate, key (adjective), landscape (abstract), leverage (verb), meticulous, multifaceted, paradigm shift, paramount, pivotal, quietly, realm, showcase, streamline, supercharge, tapestry, testament, this changes everything, this is huge, transformative, underscore (verb), utilize, valuable, vibrant. Keep technical senses: robust test, gated feature, key-value store.
**Often empty:** just, literally, honestly, simply, truly, fundamentally, inherently, inevitably; at the end of the day, when it comes to, in today's world, in the age of, in the world of, in terms of, with regard to, in order to, going forward, in this article.
**Problem:** Models use these far more than people, especially in clusters. Cut the first list. Cut the second when it adds nothing, and keep it when it carries emphasis, doubt, contrast, or the writer's spoken rhythm. A formal word outside these lists is not a tell by itself.
**Before:**
> Additionally, a distinctive feature of Somali cuisine is the incorporation of camel meat. An enduring testament to Italian colonial influence is the widespread adoption of pasta in the local culinary landscape.
**After:**
> Somali cuisine also includes camel meat. Pasta, introduced during Italian colonization, remains common, especially in the south.

### 16. Inflated significance

**Watch for:** stands as a testament, a pivotal or crucial moment, plays a key or vital role, solidifies its position, marking or shaping the, underscores its importance, reflects a broader, lasting legacy, setting the stage for, evolving landscape, indelible mark; Despite these challenges... continues to thrive; stock sections (Challenges and Legacy, Future Outlook); the future looks bright, exciting times ahead
**Problem:** An ordinary detail is said to mark a change, prove a legacy, or promise a future, at the scale of a phrase, a stock section, or a send-off paragraph. Keep the fact, drop the significance, and end on the last concrete fact.
**Before:**
> The launch marks a pivotal moment for the company.
**After:**
> The launch is the company's first paid product.

### 17. Vague connection

**Watch for:** associated with, in connection with, linked to, tied to
**Problem:** Two things are said to be connected without saying how. Name the relationship the source gives; if it gives none, keep the vague wording rather than invent a role.
**Before:**
> He is associated with the Rajhans Orchestra, which he founded and conducts.
**After:**
> He founded and conducts the Rajhans Orchestra.

### 18. Shallow -ing riders

**Watch for:** highlighting, underscoring, emphasizing, ensuring, reflecting, symbolizing, contributing to, fostering, showcasing
**Problem:** An -ing phrase bolted onto a fact pretends to explain what it means. Keep the fact; keep the rider only when the source supports it, and prefer saying what the fact does for someone.
**Before:**
> The launch adds file search, highlighting the team's commitment to better workflows.
**After:**
> The launch adds file search, so users can find old drafts without leaving the editor.

### 19. Sales language

**Watch for:** rich (figurative), profound, exemplifies, commitment to, natural beauty, nestled, in the heart of, groundbreaking, renowned, diverse array, breathtaking, must-visit, stunning
**Problem:** The text reads like an advertisement. State what the thing is.
**Before:**
> Nestled within the breathtaking region of Gonder, Alamata Raya Kobo stands as a vibrant town with a rich cultural heritage.
**After:**
> Alamata Raya Kobo is a town in the Gonder region of Ethiopia.

### 20. Borrowed authority

**Watch for:** experts argue, experts agree, studies show, industry reports suggest, many argue, widely regarded as, observers have cited; a list of outlets someone was featured in; follower counts
**Problem:** An unnamed authority or a list of prestige names stands in for what was said. Name the source and what it said, or cut the claim. If the user has none, ask; never invent one. A missing citation alone is not a tell.
**Before:**
> Experts believe the river plays a crucial role in the regional ecosystem.
**After:**
> Researchers study the river for its unusual characteristics.

### 21. Avoiding is, are, and has

**Watch for:** serves as, stands as, functions as, represents [a]; boasts, features, offers, maintains [a]; made a decision, has the ability to
**Problem:** A simple verb is replaced with a longer phrase. Use *is*, *are*, *has*, and the direct verb (decided, can).
**Before:**
> Gallery 825 serves as LAAA's exhibition space. The gallery boasts over 3,000 square feet.
**After:**
> Gallery 825 is LAAA's exhibition space. It has 3,000 square feet.

## D. Formatting by rule

Templates produce clean formatting too. The tell is decoration on every item.

### 22. Bold and lists as decoration

**Problem:** Bold sprinkled mid-sentence, every list item with a bold label and a colon, or bullets where two sentences of prose would read better. Remove the bold; turn a labeled list into prose when the labels carry nothing.
**Before:**
> - **Performance:** Performance has been enhanced through optimized algorithms.
> - **Security:** Security has been strengthened with end-to-end encryption.
**After:**
> The update speeds up load times and adds end-to-end encryption.

### 23. Decorative headings

**Problem:** Title Case Headings, emoji or arrows in headings and items, a rule between every section, a heading over a two-sentence section, a top heading that repeats the title, or a heading written for effect ("The decision, on one screen") instead of naming what the section holds ("How the six options compare"). Use sentence case, cut the decoration, and merge tiny sections.

### 24. Curly quotation marks

**Problem:** “Curly” quotes where the writer or format uses "straight" ones. Editors auto-curl, so *weak alone*.

## E. Leftovers from the chat and the draft

Remove outright.

### 25. Chatbot residue

**Watch for:** I hope this helps, Of course!, Certainly!, Great question!, You're absolutely right, Would you like..., Want me to...?, let me know if, here is a...
**Problem:** A chatbot's greeting, praise, offer, or sign-off wraps content that should stand alone. Remove the wrapper, keep the content.

### 26. Knowledge-limit disclaimers and guesses

**Watch for:** as of my last update, while specific details are limited, based on available information, not publicly available, not widely documented, maintains a low profile, likely [grew up, studied, began], it is believed that
**Problem:** The text marks where the model's knowledge ends, then fills the gap with a guess. Say what the source does not show, or cut the sentence.
**Before:**
> Information about her early life is not publicly available, suggesting she maintains a low profile. She likely grew up in a middle-class household.
**After:**
> Her early life is not documented in the available sources. (Or omit it.)

### 27. Heading repeated in the first sentence

**Problem:** A heading is followed by a line restating it ("## Performance / Speed matters."). Remove the line.

### 28. Writing about the document

**Watch for:** what the text replaced ("was added to replace"); how it was made ("compiled from", "anything unconfirmed is flagged rather than guessed"); a layout the reader can see ("the table below compares"); "in this article"
**Problem:** The text describes itself instead of its subject. Mention earlier versions only in changelogs, release notes, and migration guides. Keep a source credit the reader can follow and a caveat that changes what they do. *Weak alone* when it is a single line.
**Before:**
> This function was added to replace the previous approach of iterating through all items, which caused O(n²) performance.
**After:**
> This function uses a hash map for O(1) lookups instead of O(n²) iteration.

## F. Writing for the wrong reader

### 29. Re-explaining what the reader knows

Act on this only when you can see the conversation, or the text is plainly a reply. Otherwise ask, or leave it.
**Watch for:** a short reply that restates the problem, walks the diagnosis, and lays out evidence before the decision; queries, commands, or numbers included to prove a plan will work; background the other person wrote; the answer in the last line.
**Problem:** The reader already has the context, so rebuilding it buries the point, and each sentence reads fine alone, so this survives sentence-level cleanup. Lead with the decision; keep only the fact the reader lacks and any link they need to act. The diagnosis belongs in the ticket or doc.
**Before:**
> Yeah, you're right, this works around the issue rather than fixing it. The real fix is in `MergeService`: when we move a child under a new parent, it should update `pipeline_id` along with `parent_id`. I checked QA: 123 past merges, only 6 rows wrong now, so the cleanup is small. Since `MergeService` is shared, I'd rather open a separate ticket than widen this PR.
**After:**
> Agreed, this is a workaround. The proper fix is in `MergeService`, which is shared code, so I'd rather open a separate ticket for it and the backfill than widen this PR.

## Source

Merged from [blader/humanizer](https://github.com/blader/humanizer) 3.1.0 (MIT, after Wikipedia's ["Signs of AI writing"](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing)) and [petergyang/no-ai-slop](https://github.com/petergyang/no-ai-slop) (MIT).
