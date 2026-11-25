import { L } from '../core/lang';
import { GuidePage } from './guide';

/** Officer Yoon's lines. Ids are remembered once read (see guide.ts). */
export const TIPS = {
  // The first game, step by step.
  'hq-welcome': (): GuidePage[] => [
    { text: L('반가워요, 대표님! 헌터 협회 안내 담당 윤 주임입니다. 처음이시니 제가 옆에서 도와드릴게요.', "Welcome, boss! I'm Officer Yoon from the Hunter Association. It's your first time, so I'll walk you through it.") },
    { text: L('이게 헌터 자격증이에요. 등급은 F부터 SSS까지 있고, 전투력과 협회 랭킹으로 정해져요. 목표는 이 헌터를 SSS급까지 키우는 거예요.', "This is the hunter license. Ranks go from F to SSS, set by power and the Association ranking. Your goal: raise this hunter to SSS."), target: L('헌터 자격증', 'Hunter License') },
    { text: L('운영 자금으로 헌터를 훈련시킬 수 있어요. [공격 훈련]을 한 번 눌러 보세요.', 'Agency funds pay for training. Try pressing [ATK Training] once.'), target: L('공격 훈련', 'ATK Training') },
  ],
  'hq-tower': (): GuidePage[] => [
    { text: L('좋아요! 이제 헌터를 [성장의 탑]에 보내 볼까요? 탑에서 몬스터를 잡아 번 돈의 일부는 에이전시 몫이 돼요.', "Nice! Now let's send your hunter to the [Tower of Growth]. Part of what they earn there goes to the agency."), target: L('▶  성장의 탑', '▶  Tower of Growth') },
  ],
  'tw-move': (dpad: boolean, touch: boolean, target?: GuidePage['target']): GuidePage[] => [
    {
      target,
      text: !touch
        ? L('성장의 탑 1층이에요. 방향키나 WASD로 움직여요. 한 번 움직일 때마다 한 턴이 지나요.', 'Tower of Growth, 1F. Move with the arrow keys or WASD. Each step is one turn.')
        : dpad
          ? L('성장의 탑 1층이에요. 왼쪽 아래 십자 버튼을 눌러 움직여요. 누르고 있으면 계속 걸어요.', 'Tower of Growth, 1F. Press the D-pad at the bottom left to move. Hold it to keep walking.')
          : L('성장의 탑 1층이에요. 화면을 누른 채 끌면 조이스틱이 생기고, 그 방향으로 걸어요. 한 걸음이 한 턴이에요.', 'Tower of Growth, 1F. Touch and drag to make a joystick and walk that way. Each step is one turn.'),
    },
    { text: L('계단을 찾으면 다음 층으로 올라갈 수 있어요. 이번 층은 쉽게 해 뒀으니 편하게 둘러보세요.', 'Find the stairs to go up. This floor is an easy one, so take a look around.') },
  ],
  'tw-attack': (archer: boolean): GuidePage[] => [
    {
      text: archer
        ? L('몬스터예요! 몬스터 쪽으로 걸어가면 공격해요. 궁수는 [공격] 버튼으로 일직선 3칸 안의 적을 쏠 수 있어요.', 'A monster! Walk into it to attack. Archers can also press [Attack] to shoot an enemy up to 3 tiles away in a line.')
        : L('몬스터예요! 몬스터 쪽으로 걸어가면 공격해요. [공격] 버튼은 그 자리에서 바로 옆 적을 쳐요.', 'A monster! Walk into it to attack. [Attack] hits an enemy right next to you without moving.'),
      target: L('공격', 'Attack'),
    },
  ],
  'tw-skill': (skill: string): GuidePage[] => [
    { text: L('잘했어요! 이번엔 스킬을 써 보세요. 마나를 써서 강한 공격을 해요. 마나는 걸을 때마다 조금씩 차요.', 'Well done! Now try a skill. It spends mana for a strong attack. Mana refills a little every step.'), target: skill },
  ],
  'tw-potion': (): GuidePage[] => [
    { text: L('체력이 줄었네요. [가방]에서 체력 물약을 마실 수 있어요. 귀환하면 가방은 물약 1개로 돌아가니 아끼지 마세요.', 'Your HP is down. Drink an HP potion from the [Bag]. The bag resets to 1 potion on return, so use it.'), target: L('가방', 'Bag') },
  ],
  'tw-stairs': (): GuidePage[] => [
    { text: L('계단이에요! 더 올라가면 수입이 커지지만, 쓰러지면 이번 수입을 모두 잃어요. 처음엔 몇 층 올라갔다가 귀환하는 걸 추천해요.', "The stairs! Going higher earns more, but if you fall you lose this run's income. At first, climb a few floors and come back.") },
  ],
  'hq-return': (): GuidePage[] => [
    { text: L('첫 탐험 수고하셨어요! 헌터가 번 돈의 일부는 운영 자금으로 들어와요(상납). 등급이 오를수록 상납 비율은 낮아져요.', 'Great first run! Part of what the hunter earns comes to the agency as its cut. The higher the rank, the smaller the cut.') },
    { text: L('운영 자금으로는 훈련을, 헌터 소지금으로는 물약을 사요.', "Agency funds pay for training; the hunter's purse buys potions.") },
    { text: L('상납금이 쌓이면 에이전시 레벨이 올라 게이트, 장비 뽑기, 강화 같은 기능이 하나씩 열려요. 헌터 소지금을 [투자]하면 1.5배로 쳐 줘서 더 빨리 올라요.', 'The cut raises the agency level, which opens gates, gear draws, enhancing and more. Investing the hunter\'s gold counts 1.5x, so it levels faster.'), target: L('투자', 'Invest') },
  ],

  // Once, the first time each thing turns up.
  card: (): GuidePage[] => [
    { text: L('레벨업 카드예요! 새 스킬을 배우거나 가진 스킬을 강화해요. 스킬 칸은 Lv.1, 5, 10에 하나씩 열려요.', 'A level-up card! Learn a new skill or upgrade one you have. Skill slots open at Lv.1, 5 and 10.') },
  ],
  elite: (): GuidePage[] => [
    { text: L('금빛으로 빛나는 적은 [중간보스]예요. 강하지만 쓰러뜨리면 장비를 떨어뜨려요.', 'A gold-glowing enemy is a [Mid-boss]. Tough, but it drops gear.') },
  ],
  boss: (): GuidePage[] => [
    { text: L('층 보스예요! 5층마다 있고, 쓰러뜨려야 계단이 열려요. 체력과 물약을 확인하고 싸우세요.', 'A floor boss! One every 5 floors, and the stairs stay shut until it falls. Check your HP and potions first.') },
  ],
  merchant: (): GuidePage[] => [
    { text: L('$ 표시는 떠돌이 상인이에요. 이번 탐험 수입으로 물건을 살 수 있고, 거래가 끝나면 떠나요.', "The $ is a wandering merchant. Buy with this run's income; they leave once you're done.") },
  ],
  chest: (): GuidePage[] => [
    { text: L('보물상자예요! 골드, 물약, 장비가 들어 있어요. 4층부터는 가끔 저주받은 상자도 있으니 조심하세요.', 'A treasure chest! Gold, potions or gear inside. From 4F some are cursed, so be careful.') },
  ],
  former: (): GuidePage[] => [
    { text: L('보라빛 헌터는 경쟁사 소속이에요. 옛 동료일 수도, 라이벌일 수도 있죠. 쓰러뜨리면 보상을 받고 보내줄지, 완전히 쓰러뜨릴지 고를 수 있어요.', "A purple hunter belongs to the rival agency: a former ally or a rival. Beat them, then take a reward and let them go, or finish them for good.") },
  ],
  collapse: (): GuidePage[] => [
    { text: L('한 층에 너무 오래 머물면 던전이 무너지고, 쓰러뜨릴 수 없는 심연의 추적자가 나타나요. 오른쪽 위 숫자가 0이 되기 전에 계단으로 가세요.', 'Stay too long on one floor and the dungeon collapses, sending an Abyss Stalker that cannot be killed. Reach the stairs before the counter at the top right hits 0.') },
  ],
  duel: (): GuidePage[] => [
    { text: L('랭커 도전이에요! 이기면 그 순위를 빼앗고, 져도 목숨은 잃지 않아요. 하루에 한 번 도전할 수 있어요.', "A ranker challenge! Win and you take their place; lose and you still live. One challenge a day.") },
  ],
  arena: (): GuidePage[] => [
    { text: L('생존 아레나예요! 적이 웨이브로 몰려오고, 넘길 때마다 더 강해져요. 웨이브 사이에 나갈 수 있고, 쓰러져도 목숨은 잃지 않아요. 대신 진행 중인 웨이브의 수입은 잃어요.', 'The Survival Arena! Foes come in waves, stronger each time. You can leave between waves, and falling will not kill you, but you lose what the current wave earned.') },
  ],
  quests: (): GuidePage[] => [
    { text: L('협회 의뢰판이에요! 의뢰는 3일 동안 열려 있고, 헌터가 살아서 돌아와야 진행이 인정돼요. 깨면 운영 자금, 마력석, 에이전시 경험치를 받아요.', 'The Association quest board! Each quest is up for 3 days, and progress counts only when the hunter comes home. Finishing one pays funds, mana stones and agency EXP.') },
  ],
  gates: (): GuidePage[] => [
    { text: L('게이트는 이세계로 통하는 짧은 던전이에요. 한 번 들어가면 닫히고, 경쟁사도 노려요. 클리어하면 큰 보상과 장비를 받아요.', 'Gates are short dungeons into the other world. They close once entered, and the rival wants them too. Clear one for a big reward and gear.') },
  ],
  stones: (): GuidePage[] => [
    { text: L('마력석이 생겼네요! [강화]에서 장비를 강화할 수 있어요. +5부터는 실패하면 떨어지거나 부서질 수 있으니 조심하세요.', 'You have mana stones! Use [Enhance] to upgrade gear. From +5 a failure can drop or break it.'), target: L('강화', 'Enhance') },
  ],
  gacha: (): GuidePage[] => [
    { text: L('장비 뽑기예요. 헌터 소지금으로 높은 단계 장비를 노릴 수 있어요. 8·9단계 장비는 뽑기에서만 나와요.', "The gear draw. Spend the hunter's purse for a shot at high-tier gear. Tier 8 and 9 only come from draws.") },
  ],
  rift: (): GuidePage[] => [
    { text: L('대균열이 열렸어요! 며칠 안에 막지 못하면 경쟁사가 공을 가져가요. 도전은 단 한 번뿐이니 준비하고 가세요.', 'A Great Rift has opened! If you do not seal it in a few days, the rival takes the glory. You get one try, so prepare.'), target: L('게이트', 'Gates') },
  ],
};

export type TipId = keyof typeof TIPS;
