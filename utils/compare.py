import base64
import os

import cv2
import requests
from skimage.metrics import structural_similarity as ssim

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV_PATH = os.path.join(ROOT_DIR, ".env")

BASELINE_DIR = "screenshots/baseline"
CURRENT_DIR = "screenshots/current"
REPORTS_DIR = "reports"
DIFF_DIR = os.path.join(REPORTS_DIR, "diff")

GROQ_API_KEY = ""
SSIM_THRESHOLD = 0.95
DETAIL_ANALYSIS_THRESHOLD = 0.97
GROQ_MODEL = "llama3-8b-8192"
GROQ_VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"
MIN_DIFF_BOX_AREA = 50


def load_env_file(env_path):
    if not os.path.exists(env_path):
        return

    with open(env_path, "r", encoding="utf-8") as env_file:
        for raw_line in env_file:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue

            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")

            if key and key not in os.environ:
                os.environ[key] = value


def load_config():
    global GROQ_API_KEY
    global SSIM_THRESHOLD
    global DETAIL_ANALYSIS_THRESHOLD
    global GROQ_MODEL
    global GROQ_VISION_MODEL
    global MIN_DIFF_BOX_AREA

    load_env_file(ENV_PATH)
    GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip()
    SSIM_THRESHOLD = float(os.getenv("SSIM_THRESHOLD", "0.95"))
    DETAIL_ANALYSIS_THRESHOLD = float(
        os.getenv("DETAIL_ANALYSIS_THRESHOLD", "0.97")
    )
    GROQ_MODEL = os.getenv("GROQ_COMPARE_MODEL", "llama3-8b-8192").strip()
    GROQ_VISION_MODEL = os.getenv(
        "GROQ_COMPARE_VISION_MODEL",
        "meta-llama/llama-4-scout-17b-16e-instruct",
    ).strip()
    MIN_DIFF_BOX_AREA = int(os.getenv("MIN_DIFF_BOX_AREA", "50"))


def list_pngs(folder_path):
    if not os.path.exists(folder_path):
        return []
    return sorted(
        file_name
        for file_name in os.listdir(folder_path)
        if file_name.lower().endswith(".png")
    )


def encode_image_as_data_url(image_path):
    with open(image_path, "rb") as image_file:
        encoded = base64.b64encode(image_file.read()).decode("utf-8")
    return f"data:image/png;base64,{encoded}"


def get_llm_analysis(filename, score, diff_path):
    if not GROQ_API_KEY:
        return "LLM analysis skipped: GROQ_API_KEY is not configured."

    prompt = f"""
You are an AI visual testing assistant.

You are given a diff image for the UI screenshot '{filename}'.
The diff image contains red rectangles around detected changed areas.
Similarity score: {score:.3f}

Analyze the highlighted visual differences in this diff image and explain in 2-4 short lines:
- what changed visually
- whether it looks like layout shift, moved button, alignment issue, missing element, text/content change, or color/style change
- whether the change looks major or minor

Focus only on visible differences highlighted in the diff image.
""".strip()

    try:
        response = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {GROQ_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": GROQ_VISION_MODEL,
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": encode_image_as_data_url(diff_path),
                                    "detail": "auto",
                                },
                            },
                        ],
                    }
                ],
            },
            timeout=30,
        )
        response.raise_for_status()

        data = response.json()
        return data["choices"][0]["message"]["content"].strip()
    except Exception as error:
        try:
            fallback_prompt = f"""
You are an AI visual testing assistant.

A UI screenshot named '{filename}' has changed.
Similarity score: {score:.3f}
The diff image file is '{os.path.basename(diff_path)}'.

Explain in 1-2 lines what kind of UI change this could indicate.
Focus on:
- layout shift
- missing elements
- alignment issues
- color or text changes
""".strip()

            response = requests.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {GROQ_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": GROQ_MODEL,
                    "messages": [{"role": "user", "content": fallback_prompt}],
                },
                timeout=30,
            )
            response.raise_for_status()

            data = response.json()
            return (
                data["choices"][0]["message"]["content"].strip()
                + f" (Vision fallback used after: {str(error)})"
            )
        except Exception as fallback_error:
            return f"LLM analysis failed: {str(fallback_error)}"


def create_baseline_from_current(current_files):
    print("Baseline not found. Creating baseline...\n")

    for file_name in current_files:
        src = os.path.join(CURRENT_DIR, file_name)
        dst = os.path.join(BASELINE_DIR, file_name)

        img = cv2.imread(src)
        if img is not None:
            cv2.imwrite(dst, img)

    print("Baseline created. Run again for comparison.\n")


def get_diff_regions(contours):
    regions = []

    for contour in contours:
        x, y, w, h = cv2.boundingRect(contour)
        area = w * h

        if area < MIN_DIFF_BOX_AREA:
            continue

        regions.append(
            {
                "x": int(x),
                "y": int(y),
                "width": int(w),
                "height": int(h),
                "area": int(area),
            }
        )

    regions.sort(key=lambda item: item["area"], reverse=True)
    return regions


def build_region_summary(regions):
    if not regions:
        return "No major boxed differences were detected."

    summary_lines = [f"Detected {len(regions)} highlighted difference region(s)."]
    for index, region in enumerate(regions[:5], start=1):
        summary_lines.append(
            f"Region {index}: x={region['x']}, y={region['y']}, "
            f"w={region['width']}, h={region['height']}, area={region['area']}"
        )
    return " ".join(summary_lines)


def compare_images():
    os.makedirs(REPORTS_DIR, exist_ok=True)
    os.makedirs(DIFF_DIR, exist_ok=True)

    report = []
    current_files = list_pngs(CURRENT_DIR)
    baseline_files = set(list_pngs(BASELINE_DIR))

    if not current_files:
        print("No current screenshots found in screenshots/current.\n")
        return

    if not baseline_files:
        create_baseline_from_current(current_files)
        return

    print("Comparing screenshots...\n")
    print(f"Pass threshold: {SSIM_THRESHOLD:.2f}")
    print(f"Detailed analysis threshold: {DETAIL_ANALYSIS_THRESHOLD:.2f}\n")

    for file_name in current_files:
        base_path = os.path.join(BASELINE_DIR, file_name)
        curr_path = os.path.join(CURRENT_DIR, file_name)

        if not os.path.exists(base_path):
            report.append(f"{file_name} -> No baseline found")
            continue

        img1 = cv2.imread(base_path)
        img2 = cv2.imread(curr_path)

        if img1 is None or img2 is None:
            report.append(f"{file_name} -> Error reading image")
            continue

        if img1.shape != img2.shape:
            img2 = cv2.resize(img2, (img1.shape[1], img1.shape[0]))

        gray1 = cv2.cvtColor(img1, cv2.COLOR_BGR2GRAY)
        gray2 = cv2.cvtColor(img2, cv2.COLOR_BGR2GRAY)

        score, diff = ssim(gray1, gray2, full=True)
        diff = (diff * 255).astype("uint8")

        thresh = cv2.threshold(diff, 200, 255, cv2.THRESH_BINARY_INV)[1]
        contours, _ = cv2.findContours(
            thresh,
            cv2.RETR_EXTERNAL,
            cv2.CHAIN_APPROX_SIMPLE,
        )

        regions = get_diff_regions(contours)
        marked_image = img2.copy()
        for region in regions:
            x = region["x"]
            y = region["y"]
            w = region["width"]
            h = region["height"]
            cv2.rectangle(marked_image, (x, y), (x + w, y + h), (0, 0, 255), 2)

        diff_path = os.path.join(DIFF_DIR, f"diff_{file_name}")
        cv2.imwrite(diff_path, marked_image)
        region_summary = build_region_summary(regions)

        if score < SSIM_THRESHOLD:
            explanation = get_llm_analysis(file_name, score, diff_path)
            report.append(f"{file_name} -> UI Changed (Score: {score:.3f})")
            report.append(f"   Difference Summary: {region_summary}")
            report.append(f"   AI Insight: {explanation}")
            report.append(f"   Diff Image: {diff_path}\n")
        elif score < DETAIL_ANALYSIS_THRESHOLD:
            explanation = get_llm_analysis(file_name, score, diff_path)
            report.append(
                f"{file_name} -> OK but visually different in detail (Score: {score:.3f})"
            )
            report.append(f"   Difference Summary: {region_summary}")
            report.append(f"   AI Insight: {explanation}")
            report.append(f"   Diff Image: {diff_path}\n")
        else:
            report.append(f"{file_name} -> OK (Score: {score:.3f})")
            report.append(f"   Difference Summary: {region_summary}")
            report.append(f"   Diff Image: {diff_path}")

    report_path = os.path.join(REPORTS_DIR, "report.txt")
    with open(report_path, "w", encoding="utf-8") as report_file:
        for line in report:
            report_file.write(line + "\n")

    print("\nVISUAL TEST REPORT:\n")
    for line in report:
        print(line)

    print(f"\nDiff images saved in: {DIFF_DIR}")


if __name__ == "__main__":
    load_config()
    compare_images()
