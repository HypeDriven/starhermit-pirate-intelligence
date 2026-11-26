//! Game adapter for Chimera's English front end, phrase planner and physical voice.
use std::cell::RefCell;
use std::io::Read;
use std::sync::LazyLock;

use chimera::anatomy::human::BodyMix;
use chimera::phonetics::english::EnglishG2P;
use chimera::phonetics::planner::{PhraseInput, PlanOptions, plan_phrases};
use chimera::voice::human_voice::{HumanVoice, SourcePatch};
use flate2::read::GzDecoder;

const SAMPLE_RATE: f64 = 24_000.0;
const BLOCK: usize = 128;
const INPUT_BYTES: usize = 720;
const MAX_SAMPLES: usize = 12 * SAMPLE_RATE as usize;

static ENGLISH: LazyLock<EnglishG2P> = LazyLock::new(|| {
    let mut dict = String::new();
    GzDecoder::new(&include_bytes!("../cmudict.txt.gz")[..])
        .read_to_string(&mut dict)
        .expect("bundled CMU pronunciation dictionary");
    let mut g2p = EnglishG2P::new();
    g2p.load_dict(&dict);
    g2p
});

thread_local! {
    static INPUT: RefCell<[u8; INPUT_BYTES]> = const { RefCell::new([0; INPUT_BYTES]) };
    static OUTPUT: RefCell<[f32; BLOCK]> = const { RefCell::new([0.0; BLOCK]) };
    static VOICE: RefCell<Option<HumanVoice>> = const { RefCell::new(None) };
}

#[unsafe(no_mangle)]
pub extern "C" fn input_ptr() -> *mut u8 {
    INPUT.with(|input| input.borrow_mut().as_mut_ptr())
}

#[unsafe(no_mangle)]
pub extern "C" fn output_ptr() -> *const f32 {
    OUTPUT.with(|output| output.borrow().as_ptr())
}

#[unsafe(no_mangle)]
pub extern "C" fn prepare() {
    LazyLock::force(&ENGLISH);
}

#[unsafe(no_mangle)]
pub extern "C" fn plan(
    len: usize,
    female: f64,
    child: f64,
    pitch: f64,
    rate: f64,
    roughness: f64,
    breath: f64,
) -> usize {
    let phrases = INPUT.with(|input| {
        let bytes = input.borrow();
        let text = std::str::from_utf8(bytes.get(..len).unwrap_or_default()).unwrap_or_default();
        ENGLISH.to_phrases(text)
    });
    let phrases: Vec<_> = phrases
        .into_iter()
        .filter(|p| !p.segments.is_empty())
        .map(|p| PhraseInput {
            segments: p.segments,
            intonation: Some(p.intonation),
            pause: Some(p.pause),
        })
        .collect();
    if phrases.is_empty() {
        return 0;
    }

    let body = BodyMix::new(female, child);
    let plan = plan_phrases(
        &phrases,
        &PlanOptions {
            body,
            t0: 0.04,
            f0: Some(pitch),
            rate: Some(rate),
            ..Default::default()
        },
    );
    let mut voice = HumanVoice::new(SAMPLE_RATE, body.body(), 4);
    voice.set_source(&SourcePatch {
        f0: Some(pitch),
        roughness: Some(roughness),
        breathiness: Some(breath),
        ..Default::default()
    });
    voice.schedule(&plan.gestures);
    VOICE.with(|slot| slot.replace(Some(voice)));
    (((plan.end + 0.25) * SAMPLE_RATE).ceil() as usize).min(MAX_SAMPLES)
}

#[unsafe(no_mangle)]
pub extern "C" fn render(count: usize) {
    VOICE.with(|voice| {
        if let Some(voice) = voice.borrow_mut().as_mut() {
            OUTPUT.with(|output| voice.render(&mut output.borrow_mut()[..count.min(BLOCK)]));
        }
    });
}

#[unsafe(no_mangle)]
pub extern "C" fn clear() {
    VOICE.with(|voice| voice.replace(None));
}
