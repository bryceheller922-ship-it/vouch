-- =============================================================================
--  vouch.school — seed data (schools + positive-only question bank)
--  Safe to re-run: every insert is idempotent.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Schools
--   domain_extension set   => must sign in with a matching school email
--   domain_extension NULL  => open (typical for high schools)
-- -----------------------------------------------------------------------------
insert into public.schools (name, domain_extension, city, timezone) values
  -- Wisconsin colleges
  ('University of Wisconsin–Madison',       'wisc.edu',      'Madison, WI',      'America/Chicago'),
  ('University of Wisconsin–Milwaukee',     'uwm.edu',       'Milwaukee, WI',    'America/Chicago'),
  ('Marquette University',                  'marquette.edu', 'Milwaukee, WI',    'America/Chicago'),
  ('Milwaukee School of Engineering',       'msoe.edu',      'Milwaukee, WI',    'America/Chicago'),
  ('Carroll University',                    'carrollu.edu',  'Waukesha, WI',     'America/Chicago'),
  ('Lawrence University',                   'lawrence.edu',  'Appleton, WI',     'America/Chicago'),
  -- Milwaukee-area high schools (open enrollment)
  ('Rufus King International High School',  null,            'Milwaukee, WI',    'America/Chicago'),
  ('Riverside University High School',      null,            'Milwaukee, WI',    'America/Chicago'),
  ('Whitefish Bay High School',             null,            'Whitefish Bay, WI','America/Chicago'),
  ('Shorewood High School',                 null,            'Shorewood, WI',    'America/Chicago'),
  ('Wauwatosa East High School',            null,            'Wauwatosa, WI',    'America/Chicago'),
  ('Wauwatosa West High School',            null,            'Wauwatosa, WI',    'America/Chicago'),
  ('Brookfield Central High School',        null,            'Brookfield, WI',   'America/Chicago'),
  ('Brookfield East High School',           null,            'Brookfield, WI',   'America/Chicago'),
  ('Homestead High School',                 null,            'Mequon, WI',       'America/Chicago'),
  ('Marquette University High School',      null,            'Milwaukee, WI',    'America/Chicago'),
  ('Divine Savior Holy Angels High School', null,            'Milwaukee, WI',    'America/Chicago'),
  -- National colleges
  ('University of Michigan',                'umich.edu',     'Ann Arbor, MI',    'America/Detroit'),
  ('Northwestern University',               'northwestern.edu','Evanston, IL',   'America/Chicago'),
  ('University of Illinois Urbana-Champaign','illinois.edu', 'Champaign, IL',    'America/Chicago'),
  ('New York University',                   'nyu.edu',       'New York, NY',     'America/New_York'),
  ('University of Texas at Austin',         'utexas.edu',    'Austin, TX',       'America/Chicago'),
  ('UCLA',                                  'ucla.edu',      'Los Angeles, CA',  'America/Los_Angeles'),
  ('Stanford University',                   'stanford.edu',  'Stanford, CA',     'America/Los_Angeles'),
  -- Sandbox school for local testing (scripts/seed-demo.mjs fills it with students)
  ('Vouch Demo High',                       null,            'Milwaukee, WI',    'America/Chicago')
on conflict (name, city) do nothing;

-- -----------------------------------------------------------------------------
-- Question bank — compliments only. No negative / roast prompts, ever.
-- -----------------------------------------------------------------------------
insert into public.question_bank (question_text, category, emoji) values
  -- future
  ('Most likely to build a unicorn startup',              'future', '🦄'),
  ('Most likely to be a billionaire by 30',               'future', '💸'),
  ('Most likely to win an Oscar',                         'future', '🏆'),
  ('Most likely to become president',                     'future', '🏛️'),
  ('Most likely to cure a disease',                       'future', '🧬'),
  ('Most likely to go viral for something wholesome',     'future', '📈'),
  ('Most likely to write a bestselling book',             'future', '📚'),
  ('Most likely to headline Coachella',                   'future', '🎤'),
  ('Most likely to go to space',                          'future', '🚀'),
  ('Future TED talk speaker',                             'future', '🎙️'),
  -- style
  ('Best dressed',                                        'style',  '👗'),
  ('Best hair, no contest',                               'style',  '💇'),
  ('Always has the best sneakers',                        'style',  '👟'),
  ('Could be a model',                                    'style',  '📸'),
  ('Most iconic Instagram feed',                          'style',  '🖼️'),
  ('Best smile in the building',                          'style',  '😁'),
  ('Main character energy',                               'style',  '🎬'),
  ('Has the best taste in music',                         'style',  '🎧'),
  -- brains
  ('Smartest person in every class',                      'brains', '🧠'),
  ('Would win Jeopardy',                                  'brains', '❓'),
  ('Gives the best advice',                               'brains', '🦉'),
  ('Would survive a zombie apocalypse',                   'brains', '🧟'),
  ('Most creative mind',                                  'brains', '🎨'),
  ('Could teach the class better than the teacher',       'brains', '👩‍🏫'),
  ('Best at explaining things',                           'brains', '💡'),
  ('Always has a plan',                                   'brains', '🗺️'),
  -- hype
  ('Best person to hype you up',                          'hype',   '📣'),
  ('Most contagious laugh',                               'hype',   '😂'),
  ('Brings the energy to every room',                     'hype',   '⚡'),
  ('Best dance moves',                                    'hype',   '🕺'),
  ('Would win a reality show',                            'hype',   '📺'),
  ('Lowkey the most talented person here',                'hype',   '🌟'),
  ('Best athlete',                                        'hype',   '🏅'),
  ('Most likely to start a trend',                        'hype',   '🔥'),
  ('Would be the best road trip DJ',                      'hype',   '🚗'),
  ('Best at karaoke',                                     'hype',   '🎶'),
  -- funny
  ('Funniest person you know',                            'funny',  '🤣'),
  ('Best meme game',                                      'funny',  '🐸'),
  ('Sends the funniest texts',                            'funny',  '💬'),
  ('Should have a comedy special',                        'funny',  '🎭'),
  ('Best impressions',                                    'funny',  '🦜'),
  ('Wittiest comebacks',                                  'funny',  '⚔️'),
  ('Could make a teacher laugh mid-lecture',              'funny',  '😹'),
  -- kind
  ('Kindest person in school',                            'kind',   '💛'),
  ('Always makes everyone feel included',                 'kind',   '🤝'),
  ('Best friend material',                                'kind',   '🫶'),
  ('Would help you move without asking for pizza',        'kind',   '📦'),
  ('Remembers everyone''s birthday',                      'kind',   '🎂'),
  ('Most likely to make your day better',                 'kind',   '🌈'),
  ('Most trustworthy',                                    'kind',   '🔐'),
  ('Best listener',                                       'kind',   '👂'),
  ('Would be an amazing parent someday',                  'kind',   '🍼'),
  ('Pure golden retriever energy',                        'kind',   '🐶'),
  -- vibes
  ('Best vibes, always',                                  'vibes',  '✨'),
  ('Would be the best roommate',                          'vibes',  '🛋️'),
  ('Person you''d want stuck with you on a desert island','vibes',  '🏝️'),
  ('Coolest person without even trying',                  'vibes',  '😎'),
  ('Most likely to have a secret talent',                 'vibes',  '🎩'),
  ('Most underrated person here',                         'vibes',  '💎'),
  ('Most likely to be a good influence',                  'vibes',  '😇'),
  ('Best person to get lost in a city with',              'vibes',  '🗽'),
  ('Most fun at a sleepover',                             'vibes',  '🍿'),
  ('Most likely to become your favorite person',          'vibes',  '💘'),
  ('Instantly calms everyone down',                       'vibes',  '🧘'),
  ('Could befriend literally anyone',                     'vibes',  '🌍'),
  ('Most likely to plan the perfect hangout',             'vibes',  '🗓️')
on conflict (question_text) do nothing;
