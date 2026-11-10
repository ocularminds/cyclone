/** Local browser font route for canvas labels; UIKit generates its atlas from local static TTFs. */
export class Fonts {
  static revision = 0;
  static status: 'loading' | 'ready' | 'fallback' = 'loading';
  static readonly display = 'Manrope';
  static readonly task = 'Atkinson Hyperlegible Next';

  static async prepare(): Promise<void> {
    const load = async (family: string, file: string, weight: string) => {
      const url = new URL(`${import.meta.env.BASE_URL}assets/fonts/${file}.ttf`, location.href).href;
      const face = await new FontFace(family, `url("${url}")`, { weight, display: 'swap' }).load();
      document.fonts.add(face);
    };
    const results = await Promise.allSettled([
      load(Fonts.display, 'manrope', '600 700'), load(Fonts.task, 'atkinsonhyperlegiblenext-tabular', '400 700'),
    ]);
    Fonts.status = results.every(r => r.status === 'fulfilled') ? 'ready' : 'fallback';
    Fonts.revision++;
    console.info(`[cyclone][fonts] ${Fonts.status}`);
  }

  static css(size: number, weight: number, display = false): string {
    return `${weight} ${size}px "${display ? Fonts.display : Fonts.task}", system-ui, sans-serif`;
  }
}
