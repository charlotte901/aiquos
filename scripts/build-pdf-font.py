#!/usr/bin/env python3
"""把中文字体子集化，产出可嵌入 PDF 的 TTF。

    python scripts/build-pdf-font.py

为什么需要这一步：PDF 要换掉内置的 STSong-Light（不可控的阅读器替代字体），
必须嵌入自带字体。完整 Noto Sans SC 有 8k+ 字形、解压后 2.5MB，直接嵌入会
让报告膨胀十倍以上；报告实际用到的字符是有限的（正文 + 维度名 + 资源标题
的常用汉字），子集化后仅约 70KB。

字形集按「报告可能出现的全部字符」取：常用汉字表 + 全部标点 + 拉丁 + 数字。
比逐份报告动态子集更稳——不必依赖运行时拿到全文（LLM 生成的文案用字不定），
也不会因为漏字变成豆腐块。

产出：public/fonts/report-cjk-subset.ttf（构建产物，随 app 一起发布）
"""
import io
import os
import sys

try:
    from fontTools import subset
    from fontTools.ttLib import TTFont
except ImportError:
    print("需要 fontTools：pip install fonttools", file=sys.stderr)
    raise

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# 只嵌两个字重：常规承担正文，粗体只用于标题与维度名。
# 三个字重会让 PDF 膨胀到 3.5MB（每个子集约 1.17MB），而报告里 medium
# 实际用不到——正文与标题的对比用 regular/bold 两级已经足够（用户也没有
# 要求第三种字重）。
SOURCES = {
    "regular": os.path.join(ROOT, "node_modules", "@fontsource", "noto-sans-sc", "files",
                            "noto-sans-sc-chinese-simplified-400-normal.woff"),
    "bold": os.path.join(ROOT, "node_modules", "@fontsource", "noto-sans-sc", "files",
                         "noto-sans-sc-chinese-simplified-700-normal.woff"),
}
OUT_DIR = os.path.join(ROOT, "public", "fonts")

# ── 字符集 ────────────────────────────────────────────────────────────────
# 报告的字形集来自两处，合起来能覆盖静态文案与模型自由措辞：
#   A. 项目源码里实际出现的全部中文字符（静态文案零豆腐块，实测 1553 字）
#   B. 常用汉字表（现代汉语常用字表前 3500 的 Unicode 序近似），覆盖模型输出
# 之前只手工列了 1000 字左右，实测漏掉「访、敏、摘、归」等常用字，正文出现
# 豆腐块（区）。改为从源码抽取 + 常用字兜底后不再靠人工枚举。
import glob
import os as _os

_PUNCT = (
    "，。；：、！？（）《》“”‘’【】—…·～﹒％‰°℃±×÷≠≤≥∞"
    "0123456789"
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    "abcdefghijklmnopqrstuvwxyz"
    " .,:;!?()[]{}/&%+-=_\"'@#*<>|~^$\\"
)


def source_chars():
    """项目源码里出现过的全部中文字符。"""
    found = set()
    root = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))
    patterns = [
        _os.path.join(root, "src", "**", "*.js"),
        _os.path.join(root, "src", "**", "*.jsx"),
        _os.path.join(root, "worker", "**", "*.js"),
    ]
    for pattern in patterns:
        for path in glob.glob(pattern, recursive=True):
            try:
                text = open(path, encoding="utf-8").read()
            except OSError:
                continue
            found |= {ch for ch in text if "\u4e00" <= ch <= "\u9fff"}
    return found


def common_chars(cmap):
    """常用汉字：按 Unicode 升序取 CJK 基本区前 N 个。

    这是个近似——严格的《现代汉语常用字表》需要额外数据文件，而按 Unicode
    序取样在本字体（Noto Sans SC 的简体子集）里已经覆盖了绝大多数常用字，
    且实现简单、无需维护外部词表。
    """
    cjk = sorted(cp for cp in cmap if 0x4E00 <= cp <= 0x9FFF)
    return {chr(cp) for cp in cjk[:3500]}


def build_charset(cmap):
    chars = set()
    chars |= source_chars()
    chars |= common_chars(cmap)
    chars |= set(_PUNCT)
    # 报告固定用字（标题、页脚、章节名等；源码里也应该有，双保险）
    chars |= set("AIQUOS测评报告六维能力字像实心为已有积累空成长间第页共生成时间账号")
    return "".join(sorted(chars))


def subset_font(src, out_path, chars):
    options = subset.Options()
    options.flavor = None                 # 输出未压缩 TTF（PDF 可直接嵌入）
    options.desubroutinize = True         # 去掉 CFF 子程序，简化解析
    options.recalc_bounds = True
    options.layout_features = []          # 报告不需要 OpenType 布局特性
    options.drop_tables += ["BASE", "GDEF", "GPOS", "GSUB", "STAT", "gasp", "vhea", "vmtx"]
    options.notdef_outline = True
    options.recommended_glyphs = True

    font = subset.load_font(src, options)
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(text=chars)
    subsetter.subset(font)
    subset.save_font(font, out_path, options)
    return os.path.getsize(out_path)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    # 字符集需要字体的 cmap 才能定「常用字」范围，因此先读一次源字体。
    probe = TTFont(SOURCES["regular"])
    chars = build_charset(probe.getBestCmap())
    print(f"字形集：{len(chars)} 个字符（源码用字 + 常用字 + 标点）")

    for weight, src in SOURCES.items():
        if not os.path.exists(src):
            print(f"缺少字体源文件：{src}", file=sys.stderr)
            return 1
        out_path = os.path.join(OUT_DIR, f"report-cjk-{weight}.ttf")
        size = subset_font(src, out_path, chars)
        print(f"  {weight}: {os.path.relpath(out_path, ROOT)}  {round(size / 1024, 1)} KB")

        # 同时产出 CID→GID 映射表（码点 → 子集里的 glyph id）。
        #
        # 为什么需要：PDF 用 Identity-H 编码时 CID 就等于 Unicode 码点，但子集
        # 字体的 GID 是重编号过的（「测」的码点 0x6D4B，GID 却是 649）。若按
        # Identity 映射，阅读器拿码点当 GID 查字形，整页变成乱码。PDF 允许用
        # /CIDToGIDMap 指向一张显式的 2 字节映射表，这里就是那张表。
        # 用 fontTools 解析（浏览器里手解二进制表既繁琐又易错），输出 JSON。
        import json
        subset_font_obj = TTFont(out_path)
        cmap = subset_font_obj.getBestCmap()
        glyph_order = subset_font_obj.getGlyphOrder()
        mapping = {str(code): glyph_order.index(name) for code, name in cmap.items()}
        map_path = os.path.join(OUT_DIR, f"report-cjk-{weight}.map.json")
        with open(map_path, "w", encoding="utf-8") as handle:
            json.dump(mapping, handle, separators=(",", ":"))
        print(f"           → {os.path.relpath(map_path, ROOT)}  {len(mapping)} 个码点")

        # 每个码点的字符宽度（按 1000 em 归一）。
        #
        # 为什么必须给：CIDFont 的 /DW 缺省值是 1000（全角），若不提供 /W，
        # 所有字符——包括数字与拉丁——都按全角排版，正文变得异常松散、页脚
        # 直接溢出（实测）。把真实 advance width 写进 /W，中英混排才会得到
        # 正确字距。
        hmtx = subset_font_obj["hmtx"]
        upm = subset_font_obj["head"].unitsPerEm
        widths = {}
        for code, name in cmap.items():
            advance = hmtx[name][0] if name in hmtx.metrics else upm
            widths[str(code)] = round(advance * 1000 / upm)
        width_path = os.path.join(OUT_DIR, f"report-cjk-{weight}.widths.json")
        with open(width_path, "w", encoding="utf-8") as handle:
            json.dump(widths, handle, separators=(",", ":"))
        print(f"           → {os.path.relpath(width_path, ROOT)}  {len(widths)} 个字宽")

    # 校验：必需字符都在
    check = TTFont(os.path.join(OUT_DIR, "report-cjk-regular.ttf"))
    cmap = check.getBestCmap()
    missing = [ch for ch in "AIQUOS测评报告认知提示工具评估协同伦理第页共" if ord(ch) not in cmap]
    if missing:
        print(f"子集缺少字符：{''.join(missing)}", file=sys.stderr)
        return 1
    print("字体子集完成，必需字符校验通过。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
