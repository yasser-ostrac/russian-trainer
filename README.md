# Russian Trainer (static site, no build step)

Everything runs in the browser; progress lives on the device (localStorage).
Lessons: data/days.json (days 1-30) + data/days_extra.txt (day 31 onward).

Add a day = append ONE line to data/days_extra.txt:

    title | lesson | task | ru=translit=en; ru=translit=en | ru=en; ru=en

Rules: keep the " | " separators (space, bar, space), only append (never reorder or delete days),
a title starting with "Review" marks a rest day. A broken line is reported in the app
(Voice panel) and the lessons after it are not loaded.

Hosting: GitHub Pages, branch main, folder / (root). Open the site online once to get updates.
