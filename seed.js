/* ==========================================================================
   seed.js — Realistic fictional demo data so the app never feels empty.
   ========================================================================== */
/* ==========================================================================
   Generative brand artwork (pure inline SVG — no external image service).
   Deterministic per seed so the same input always renders the same look,
   and everything stays on-palette with the LinkApp brand mark.
   ========================================================================== */
function hashSeed(str){
  let h = 0;
  for(let i=0;i<str.length;i++){ h = (h*31 + str.charCodeAt(i)) >>> 0; }
  return h;
}
// Curated analogous hue pairs so generated art always feels "on brand"
// rather than landing on random, clashing colours.
const BRAND_HUE_PAIRS = [
  [214, 226], // signal blue family (matches --accent-color)
  [206, 190], // teal-blue
  [268, 250], // violet
  [162, 142], // emerald
  [28, 40],   // amber (matches --accent-warm)
  [352, 332], // rose
  [222, 204], // ocean
];
function pickHuePair(seedNum){ return BRAND_HUE_PAIRS[seedNum % BRAND_HUE_PAIRS.length]; }
function initialsFrom(seed){
  const letters = seed.replace(/[^a-zA-Z]/g,'');
  if(!letters) return 'L';
  return (letters[0] + (letters[1]||'')).toUpperCase();
}

function avatarFor(seed){
  const h = hashSeed(seed);
  const [hueA, hueB] = pickHuePair(h);
  const initials = initialsFrom(seed);
  const ringRotate = h % 360;
  const svg = `
    <svg xmlns='http://www.w3.org/2000/svg' width='128' height='128' viewBox='0 0 128 128'>
      <defs>
        <linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
          <stop offset='0' stop-color='hsl(${hueA},62%,46%)'/>
          <stop offset='1' stop-color='hsl(${hueB},70%,36%)'/>
        </linearGradient>
      </defs>
      <circle cx='64' cy='64' r='64' fill='url(#g)'/>
      <circle cx='64' cy='64' r='56' fill='none' stroke='rgba(255,255,255,.22)' stroke-width='2' transform='rotate(${ringRotate} 64 64)' stroke-dasharray='150 200'/>
      <circle cx='64' cy='64' r='45' fill='rgba(255,255,255,.06)'/>
      <text x='64' y='79' font-family='Manrope,system-ui,sans-serif' font-size='44' font-weight='800' fill='#fff' text-anchor='middle'>${initials}</text>
    </svg>`.trim().replace(/\s+/g,' ');
  return 'data:image/svg+xml;base64,' + btoa(svg);
}

function coverFor(seed){
  const h = hashSeed(seed);
  const [hueA, hueB] = pickHuePair(h);
  const variant = h % 4;
  const rand = (n, mod, add=0) => ((h >> n) % mod) + add;

  let shapes = '';
  if(variant===0){ // soft overlapping blobs
    shapes = `
      <circle cx='${rand(2,90,60)}' cy='${rand(4,60,-20)}' r='${rand(6,60,60)}' fill='rgba(255,255,255,.10)'/>
      <circle cx='${rand(8,120,220)}' cy='${rand(10,80,140)}' r='${rand(12,50,40)}' fill='rgba(255,255,255,.08)'/>
      <circle cx='${rand(14,60,-10)}' cy='${rand(16,90,120)}' r='${rand(18,70,50)}' fill='rgba(0,0,0,.08)'/>`;
  }else if(variant===1){ // diagonal stripes
    shapes = `
      <g opacity='.14'>
        <rect x='-40' y='40' width='560' height='26' fill='#fff' transform='rotate(-14 400 200)'/>
        <rect x='-40' y='110' width='560' height='14' fill='#fff' transform='rotate(-14 400 200)'/>
        <rect x='-40' y='150' width='560' height='40' fill='#000' transform='rotate(-14 400 200)'/>
      </g>`;
  }else if(variant===2){ // grid of soft circles
    let dots = '';
    for(let i=0;i<5;i++){
      const cx = 40 + i*80 + rand(i,20);
      const cy = 60 + ((i%2)*80) + rand(i+3,20);
      dots += `<circle cx='${cx}' cy='${cy}' r='${26+rand(i+5,14)}' fill='rgba(255,255,255,${0.05+ (i%3)*0.03})'/>`;
    }
    shapes = dots;
  }else{ // radiating arcs
    shapes = `
      <circle cx='400' cy='210' r='60' fill='none' stroke='rgba(255,255,255,.18)' stroke-width='14'/>
      <circle cx='400' cy='210' r='100' fill='none' stroke='rgba(255,255,255,.10)' stroke-width='10'/>
      <circle cx='400' cy='210' r='140' fill='none' stroke='rgba(255,255,255,.06)' stroke-width='8'/>`;
  }

  // Faint brand "L" mark watermark, echoing the LinkApp logo shape.
  const markX = rand(20, 260, 40), markY = rand(22, 60, 30);
  const brandMark = `
    <g transform='translate(${markX} ${markY}) scale(.42)' opacity='.10'>
      <path d='M40 20 C40 20 40 55 40 75 C40 90 55 92 70 92 L95 92' stroke='#fff' stroke-width='16' fill='none' stroke-linecap='round'/>
    </g>`;

  const svg = `
    <svg xmlns='http://www.w3.org/2000/svg' width='800' height='420' viewBox='0 0 800 420'>
      <defs>
        <linearGradient id='bg' x1='0' y1='0' x2='1' y2='1'>
          <stop offset='0' stop-color='hsl(${hueA},48%,32%)'/>
          <stop offset='1' stop-color='hsl(${hueB},58%,46%)'/>
        </linearGradient>
        <filter id='grain'>
          <feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch' result='noise'/>
          <feColorMatrix in='noise' type='matrix' values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.035 0'/>
        </filter>
      </defs>
      <rect width='800' height='420' fill='url(#bg)'/>
      ${shapes}
      ${brandMark}
      <rect width='800' height='420' filter='url(#grain)'/>
    </svg>`.trim().replace(/\s+/g,' ');
  return 'data:image/svg+xml;base64,' + btoa(svg);
}
function daysAgo(n){ const d = new Date(); d.setDate(d.getDate()-n); return d.toISOString(); }

function seedDatabase(){
  if(DB.users.length) return; // already seeded

  // ---------------- USERS ----------------
  const userSeeds = [
    {name:'Amara Obi', username:'amara.obi', headline:'Frontend Developer @ NimbusPay', company:'NimbusPay', location:'Lagos, Nigeria', skills:['JavaScript','React','CSS','UI Design'], interests:['Technology','Design']},
    {name:'David Chen', username:'david.chen', headline:'Product Manager @ Voltify', company:'Voltify', location:'Toronto, Canada', skills:['Product Strategy','Agile','Roadmapping'], interests:['Business','Technology']},
    {name:'Fatima Bello', username:'fatima.bello', headline:'UI/UX Designer, Freelance', company:'Freelance', location:'Abuja, Nigeria', skills:['Figma','User Research','Prototyping'], interests:['Design','Entrepreneurship']},
    {name:'Samuel Okoro', username:'sam.okoro', headline:'Backend Engineer @ Cloudline', company:'Cloudline', location:'Port Harcourt, Nigeria', skills:['Node.js','PostgreSQL','System Design'], interests:['Technology','Engineering']},
    {name:'Grace Adeyemi', username:'grace.ade', headline:'Marketing Lead @ Brightpath', company:'Brightpath', location:'Lagos, Nigeria', skills:['SEO','Content Strategy','Branding'], interests:['Marketing','Business']},
    {name:'Michael Umeh', username:'michael.umeh', headline:'HR Manager @ LifeCare General', company:'LifeCare General Hospital', location:'Enugu, Nigeria', skills:['Recruiting','Onboarding','People Ops'], interests:['Healthcare','Business']},
    {name:'Chiamaka Nwosu', username:'chiamaka.n', headline:'Data Analyst @ Cloudline', company:'Cloudline', location:'Lagos, Nigeria', skills:['SQL','Python','Data Viz'], interests:['Technology','Finance']},
    {name:'Peter Idris', username:'peter.idris', headline:'Full-Stack Developer, Open to work', company:'Open to work', location:'Kano, Nigeria', skills:['HTML','CSS','JavaScript','Bootstrap'], interests:['Technology','Entrepreneurship']},
    {name:'Linda Okafor', username:'linda.okafor', headline:'Recruiter @ NimbusPay', company:'NimbusPay', location:'Lagos, Nigeria', skills:['Talent Sourcing','Interviewing'], interests:['Business','Technology']},
    {name:'Tunde Bakare', username:'tunde.bakare', headline:'Photographer & Visual Storyteller', company:'Freelance', location:'Ibadan, Nigeria', skills:['Photography','Editing','Branding'], interests:['Design','Entertainment']},
    {name:'Chris Ekene', username:'chris.ekene', headline:'Web Development Intern @ Maxfront', company:'Maxfront', location:'Lagos, Nigeria', skills:['HTML','CSS','JavaScript','Bootstrap'], interests:['Technology','Design','Entrepreneurship']},
  ];
  userSeeds.forEach((u,i)=>{
    DB.users.push({
      id:uid('user'), name:u.name, username:u.username, email:`${u.username}@example.com`,
      password:'demo1234', avatar:avatarFor(u.username), cover:coverFor(u.username+'cover'),
      bio:`${u.headline}. Passionate about building things that matter.`,
      location:u.location, phone:'', website:'', headline:u.headline, company:u.company,
      title:u.headline.split(' @ ')[0], education:[{school:'University of Lagos', degree:'B.Sc Computer Science', year:'2019-2023'}],
      skills:u.skills, interests:u.interests, verified:i%3===0,
      experience:[{role:u.headline.split(' @ ')[0], org:u.company, period:'2023 — Present', desc:'Delivering high quality work across the team.'}],
      createdAt:daysAgo(120-i), settings:defaultSettings()
    });
  });

  const [amara,david,fatima,sam,grace,michael,chiamaka,peter,linda,tunde,chris] = DB.users;

  // ---------------- COMPANIES ----------------
  const companySeeds = [
    {name:'NimbusPay', industry:'Financial Technology', desc:'NimbusPay builds simple, secure payment tools for small businesses across West Africa.', location:'Lagos, Nigeria', employees:'51-200'},
    {name:'Voltify', industry:'Clean Energy', desc:'Voltify designs affordable solar-powered devices for homes and small offices.', location:'Toronto, Canada', employees:'11-50'},
    {name:'Cloudline', industry:'Cloud Infrastructure', desc:'Cloudline provides developer-friendly cloud hosting and deployment tools.', location:'Remote', employees:'201-500'},
    {name:'Brightpath Media', industry:'Marketing & Advertising', desc:'Brightpath helps growing brands tell better stories across digital channels.', location:'Lagos, Nigeria', employees:'11-50'},
    {name:'LifeCare General Hospital', industry:'Healthcare', desc:'LifeCare General Hospital provides accessible, modern healthcare services.', location:'Enugu, Nigeria', employees:'201-500'},
    {name:'Maxfront', industry:'Software Consulting', desc:'Maxfront trains and mentors the next generation of web developers through hands-on projects.', location:'Lagos, Nigeria', employees:'11-50'},
  ];
  companySeeds.forEach(c=>{
    DB.companies.push({
      id:uid('co'), name:c.name, logo:avatarFor(c.name), cover:coverFor(c.name+'cv'),
      industry:c.industry, desc:c.desc, website:`https://${c.name.toLowerCase().replace(/[^a-z]/g,'')}.example.com`,
      location:c.location, employees:c.employees, adminIds:[], createdAt:daysAgo(300)
    });
  });
  const [nimbus,voltify,cloudline,brightpath,lifecare,maxfront] = DB.companies;
  nimbus.adminIds=[linda.id]; david.company='Voltify';

  // ---------------- JOBS ----------------
  const jobSeeds = [
    {company:nimbus, title:'Frontend Developer', workType:'Remote', type:'Full-time', level:'Mid level', salary:'₦350,000 – ₦500,000/mo', location:'Lagos, Nigeria', skills:['React','JavaScript','CSS']},
    {company:cloudline, title:'Backend Engineer', workType:'Hybrid', type:'Full-time', level:'Senior level', salary:'₦700,000 – ₦900,000/mo', location:'Lagos, Nigeria', skills:['Node.js','PostgreSQL','AWS']},
    {company:brightpath, title:'Digital Marketing Intern', workType:'On-site', type:'Internship', level:'Entry level', salary:'₦80,000/mo stipend', location:'Lagos, Nigeria', skills:['SEO','Copywriting']},
    {company:voltify, title:'Product Designer', workType:'Remote', type:'Contract', level:'Mid level', salary:'$1,800 – $2,400/mo', location:'Remote', skills:['Figma','UX Research']},
    {company:lifecare, title:'IT Support Officer', workType:'On-site', type:'Full-time', level:'Entry level', salary:'₦180,000 – ₦220,000/mo', location:'Enugu, Nigeria', skills:['Networking','Troubleshooting']},
    {company:maxfront, title:'Web Development Intern', workType:'Hybrid', type:'Internship', level:'Entry level', salary:'₦60,000/mo stipend', location:'Lagos, Nigeria', skills:['HTML','CSS','JavaScript']},
    {company:nimbus, title:'QA Engineer', workType:'Remote', type:'Full-time', level:'Mid level', salary:'₦400,000 – ₦550,000/mo', location:'Lagos, Nigeria', skills:['Testing','Automation']},
  ];
  jobSeeds.forEach((j,i)=>{
    DB.jobs.push({
      id:uid('job'), companyId:j.company.id, title:j.title, location:j.location, workType:j.workType,
      salary:j.salary, experience:j.level, postedAt:daysAgo(2+i*2), type:j.type,
      desc:`We're looking for a ${j.title} to join ${j.company.name} and help us grow our product and impact.`,
      responsibilities:['Collaborate with cross-functional teams','Ship high quality work on schedule','Participate in reviews and planning'],
      requirements:[`Experience relevant to ${j.title}`,'Strong communication skills','Ability to work independently'],
      skills:j.skills, benefits:['Flexible hours','Learning budget','Health coverage'],
    });
  });

  // ---------------- CONNECTIONS / FOLLOWS ----------------
  function connect(a,b){ DB.connections.push({id:uid('conn'), userA:a.id, userB:b.id, at:daysAgo(30)}); }
  connect(chris,amara); connect(chris,sam); connect(chris,peter);
  connect(amara,david); connect(amara,fatima); connect(david,grace);
  connect(sam,chiamaka); connect(linda,michael);
  DB.connectionRequests.push({id:uid('req'), from:grace.id, to:chris.id, status:'pending', at:daysAgo(1)});
  DB.connectionRequests.push({id:uid('req'), from:tunde.id, to:chris.id, status:'pending', at:daysAgo(3)});

  function follow(u,type,target){ DB.follows.push({id:uid('fol'), follower:u.id, type, targetId:target.id, at:daysAgo(20)}); }
  follow(chris,'company',nimbus); follow(chris,'company',maxfront);
  follow(amara,'company',nimbus); follow(david,'company',voltify);
  DB.users.forEach(u=>{ if(u!==chris) follow(u,'user',chris); });

  // ---------------- POSTS ----------------
  const postSeeds = [
    {author:amara, text:'Just shipped a redesigned onboarding flow at NimbusPay 🎉 Conversion is already trending up. Small UI details really do compound.\n\n#technology #design', media:coverFor('post1')},
    {author:david, text:'Hiring tip: the best PM candidates ask more questions than they answer in the first interview. Curiosity beats polish every time.\n\n#business', media:null},
    {author:fatima, text:'New portfolio piece — a booking app redesign for a local clinic. Swipe through the before/after 👇', media:coverFor('post2')},
    {author:brightpath, authorType:'company', text:'Brightpath is turning 5! Thank you to every client who trusted us with their story. Here is to the next chapter. #marketing', media:coverFor('post3')},
    {author:sam, text:'Wrote a short breakdown of how we cut our API latency by 40% using connection pooling and better indexing. Link in comments.\n\n#engineering #technology', media:null},
    {author:maxfront, authorType:'company', text:'Our latest intern cohort just wrapped four full projects in one training cycle — a food blog, a hospital management system, an e-commerce platform, and a fintech dashboard. Proud of this group! #technology', media:coverFor('post4')},
    {author:grace, text:'A poll for my fellow marketers 👇', media:null, poll:{question:'What channel drives your best ROI right now?', options:[{text:'Organic social',votes:0},{text:'Email',votes:0},{text:'Paid search',votes:0},{text:'Referrals',votes:0}], closesAt:daysAgo(-7)}},
    {author:tunde, text:'Golden hour in Ibadan yesterday. Sometimes the best gear is just good light.', media:coverFor('post5')},
  ];
  postSeeds.forEach((p,i)=>{
    const post = {
      id:uid('post'), authorId:p.author.id, authorType:p.authorType||'user', text:p.text,
      media:p.media, type:p.poll?'poll':(p.media?'image':'text'), privacy:'Everyone',
      timestamp:daysAgo(10-i), reactions:{}, comments:[], shares:0,
      poll:p.poll||null, votedBy:[]
    };
    // seed a couple reactions
    const reactors = DB.users.slice(0,3+i%4);
    reactors.forEach(r=>{ if(r.id!==p.author.id) post.reactions[r.id] = ['like','love','celebrate','support'][Math.floor(Math.random()*4)]; });
    DB.posts.push(post);
  });
  // seed comments on first post
  DB.posts[0].comments.push(
    {id:uid('cm'), authorId:sam.id, text:'This looks so clean! Great work 👏', timestamp:daysAgo(9), likes:[david.id], replies:[]},
    {id:uid('cm'), authorId:david.id, text:'Numbers speak louder than words here.', timestamp:daysAgo(9), likes:[], replies:[
      {id:uid('cm'), authorId:amara.id, text:'Appreciate that!', timestamp:daysAgo(8), likes:[], replies:[]}
    ]}
  );

  // ---------------- ARTICLES ----------------
  DB.articles.push({
    id:uid('art'), authorId:sam.id, title:'Five habits that made me a better backend engineer',
    cover:coverFor('article1'), content:'Over the last few years I have picked up habits that consistently improve the quality of the systems I build — from writing smaller pull requests to over-communicating about trade-offs early. This article walks through what changed and why it mattered for my team.',
    tags:['Engineering','Career'], timestamp:daysAgo(15), likes:[amara.id,chiamaka.id], comments:[], saves:[]
  });
  DB.articles.push({
    id:uid('art'), authorId:grace.id, title:'Why small brands should stop copying big brand playbooks',
    cover:coverFor('article2'), content:'Every quarter I see small businesses trying to run marketing campaigns modeled after companies twenty times their size. It rarely works — and here is what to do instead, based on campaigns we have run for local clients at Brightpath.',
    tags:['Marketing','Business'], timestamp:daysAgo(6), likes:[david.id], comments:[], saves:[]
  });

  // ---------------- GROUPS (as group conversations) ----------------
  const grp1 = {id:uid('conv'), type:'group', name:'Lagos Frontend Devs', image:coverFor('grp1'),
    participantIds:[chris.id,amara.id,sam.id,peter.id], adminIds:[amara.id], description:'A community chat for frontend developers based in Lagos.',
    pinned:[], archived:[], createdAt:daysAgo(60), disappearingHours:0, locked:false, lockPin:null};
  const grp2 = {id:uid('conv'), type:'group', name:'Maxfront Interns 2026', image:coverFor('grp2'),
    participantIds:[chris.id,peter.id], adminIds:[chris.id], description:'Coordination chat for the current Maxfront internship cohort.',
    pinned:[], archived:[], createdAt:daysAgo(40), disappearingHours:0, locked:false, lockPin:null};
  DB.conversations.push(grp1,grp2);

  // ---------------- COMMUNITIES ----------------
  DB.communities.push({
    id:uid('comm'), name:'Nigerian Web Developers', desc:'A community for web developers across Nigeria to share resources, jobs, and feedback.',
    cover:coverFor('comm1'), members:[chris.id,amara.id,sam.id,peter.id,fatima.id], admins:[amara.id],
    linkedGroupIds:[grp1.id], createdAt:daysAgo(200)
  });
  DB.communities.push({
    id:uid('comm'), name:'Product & Design Circle', desc:'Discussions on product strategy, UX research and design systems.',
    cover:coverFor('comm2'), members:[david.id,fatima.id,grace.id], admins:[david.id],
    linkedGroupIds:[], createdAt:daysAgo(150)
  });

  // ---------------- CHANNELS ----------------
  DB.channels.push({
    id:uid('chan'), name:'NimbusPay Updates', desc:'Official product updates and announcements from NimbusPay.',
    image:nimbus.logo, ownerId:linda.id, followers:[chris.id,amara.id,sam.id],
    posts:[{id:uid('cp'), text:'NimbusPay now supports scheduled transfers for business accounts 🚀', timestamp:daysAgo(4), reactions:{[amara.id]:'like'}}]
  });
  DB.channels.push({
    id:uid('chan'), name:'Maxfront Learning Hub', desc:'Tips, resources and cohort news from the Maxfront internship program.',
    image:maxfront.logo, ownerId:michael.id, followers:[chris.id,peter.id],
    posts:[{id:uid('cp'), text:'New training log book template is now available — check your email 📋', timestamp:daysAgo(2), reactions:{}}]
  });

  // ---------------- STATUSES ----------------
  function addStatus(u,type,content,caption){
    DB.statuses.push({id:uid('st'), userId:u.id, type, content, caption, timestamp:daysAgo(0), expiresAt:new Date(Date.now()+24*3600*1000).toISOString(), viewers:[], reactions:{}, privacy:'Everyone'});
  }
  addStatus(amara,'image',coverFor('status1'),'Design review day ✏️');
  addStatus(sam,'text',null,'Refactoring feels so good today.');
  addStatus(fatima,'image',coverFor('status2'),'New moodboard!');
  addStatus(peter,'text',null,'Open to new opportunities 👋');

  // ---------------- EVENTS ----------------
  DB.events.push({
    id:uid('ev'), name:'Lagos Frontend Meetup', date:daysAgo(-10).slice(0,10), time:'17:00',
    location:'Ventures Platform, Lagos', desc:'A casual meetup for frontend developers to share what they are building and network.',
    organizerId:amara.id, attendees:[amara.id,chris.id,sam.id]
  });
  DB.events.push({
    id:uid('ev'), name:'NimbusPay Product Demo Day', date:daysAgo(-20).slice(0,10), time:'11:00',
    location:'Online — Livestream', desc:'See what is new in NimbusPay this quarter and ask the product team questions live.',
    organizerId:linda.id, attendees:[linda.id,david.id]
  });

  // ---------------- SERVICES ----------------
  DB.services.push({id:uid('svc'), userId:fatima.id, title:'UI/UX Design for Startups', desc:'I design clean, usable interfaces for early-stage products — from wireframes to polished prototypes.', skills:['Figma','Prototyping','User Research']});
  DB.services.push({id:uid('svc'), userId:tunde.id, title:'Product & Brand Photography', desc:'On-location product and brand photography for small businesses across Southwest Nigeria.', skills:['Photography','Editing']});
  DB.services.push({id:uid('svc'), userId:peter.id, title:'Landing Page Development', desc:'Fast, responsive landing pages built with HTML, CSS and JavaScript — no bloated frameworks.', skills:['HTML','CSS','JavaScript']});

  // ---------------- NOTIFICATIONS (for chris) ----------------
  addNotification(chris.id, 'connection_request', `${grace.name} sent you a connection request`, grace.id);
  addNotification(chris.id, 'post_reaction', `${amara.name} reacted to your post`, null);
  addNotification(chris.id, 'job_recommendation', `New job recommended: Web Development Intern at Maxfront`, DB.jobs.find(j=>j.companyId===maxfront.id).id);
  DB.notifications[0].read=false; DB.notifications[1].read=true; DB.notifications[2].read=true;

  // ---------------- MESSAGES ----------------
  const dm1 = findOrCreateDM(chris.id, amara.id);
  sendMessage(dm1.id, amara.id, "Hey! Saw your CV site, really clean layout 👏");
  sendMessage(dm1.id, chris.id, "Thank you! Still tweaking the responsive nav a bit.");
  sendMessage(dm1.id, amara.id, "Let me know if you want a second pair of eyes on it.");
  const dm2 = findOrCreateDM(chris.id, sam.id);
  sendMessage(dm2.id, sam.id, "Are you joining the Lagos Frontend Devs meetup next week?");
  sendMessage(dm2.id, chris.id, "Yes! Wouldn't miss it.");
  sendMessage(grp2.id, peter.id, "Anyone else still debugging the modal from yesterday's session?");
  sendMessage(grp2.id, chris.id, "Same here, tracking it down now.");

  // ---------------- APPLICATIONS (demo, none for chris yet) ----------------

  saveDB();
}

function defaultSettings(){
  return {
    theme:'light',
    privacy:{profileVisibility:'Everyone', whoCanMessage:'Everyone', whoCanConnect:'Everyone', whoCanFollow:'Everyone', activityVisibility:'Connections', contactInfoVisibility:'Connections'},
    chat:{readReceipts:true, lastSeen:true, onlineStatus:true, typingIndicator:true},
    statusPrivacy:'Everyone',
    notifications:{messages:true, connections:true, reactions:true, comments:true, jobs:true, groups:true},
    security:{twoStep:false},
    accessibility:{highContrast:false, reduceMotion:false},
    language:'English',
    chatFolders:[],
    wallet:{
      balance:0, lifetimeEarned:0, transactions:[],
      redeemedPerks:[], oneTimeAwards:[],
      dailyLog:{date:null, earnedToday:0, actionCounts:{}},
      loginStreak:{count:0, lastLoginDate:null},
    },
  };
}
