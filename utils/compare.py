import base64
import hashlib
import json
import os
import shutil
import sys
import time
import uuid

import cv2
import requests
from skimage.metrics import structural_similarity as ssim

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV_PATH = os.path.join(ROOT_DIR, ".env")

BASELINE_DIR = "screenshots/baseline"
CURRENT_DIR = "screenshots/current"
REPORTS_DIR = "reports"
DIFF_DIR = os.path.join(REPORTS_DIR, "diff")
ALLURE_RESULTS_DIR = "allure-results"

GROQ_API_KEY = ""
SSIM_THRESHOLD = 0.95
DETAIL_ANALYSIS_THRESHOLD = 0.97
GROQ_MODEL = "llama3-8b-8192"
GROQ_VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"
MIN_DIFF_BOX_AREA = 50
FAIL_ON_VISUAL_DIFF = False


def humanize_key(value):
    return " ".join(
        word.capitalize()
        for word in str(value or "")
        .replace(".png", "")
        .replace("_", " ")
        .split()
    )


def parse_visual_file_context(file_name):
    stem = os.path.splitext(file_name)[0]
    prefix, _, step_key = stem.partition("__")
    prefix_parts = prefix.split("_")

    project = prefix_parts[0] if prefix_parts else "visual"
    suite = prefix_parts[1] if len(prefix_parts) > 1 else "visual"
    scenario_key = "_".join(prefix_parts[2:]) if len(prefix_parts) > 2 else "comparison"

    return {
        "project": project,
        "suite": suite,
        "scenario": humanize_key(scenario_key),
        "step": humanize_key(step_key or scenario_key),
        "step_key": step_key,
    }


def is_add_to_cart_displacement(result):
    file_name = result.get("file", "").lower()
    return "add_all_the_items_to_the_cart" in file_name or "add_to_cart" in file_name


def build_visual_issue_title(result, context):
    if is_add_to_cart_displacement(result):
        return "Visual regression - Add to Cart button displacement"

    return f"Visual regression - {context['step']}"


def build_visual_issue_summary(result, context):
    title = build_visual_issue_title(result, context)
    status = result.get("status", "unknown")
    score = result.get("score", "n/a")
    summary = result.get("difference_summary", "No difference summary available.")
    insight = result.get("ai_insight", "AI insight was not generated for this comparison.")

    lines = [
        title,
        "",
        f"Suite: {context['suite']} suite",
        f"Scenario: {context['scenario']}",
        f"Step: {context['step']}",
        f"Comparison status: {status}",
        f"SSIM score: {score}",
        "",
        "Detected issue:",
    ]

    if is_add_to_cart_displacement(result):
        lines.append("Add to Cart button displacement detected in the regression checkout flow.")
    else:
        lines.append("Visual difference detected between baseline and current screenshot.")

    lines.extend(
        [
            "",
            f"Difference summary: {summary}",
            "",
            f"AI insight: {insight}",
        ]
    )
    return "\n".join(lines)


def copy_allure_attachment(source_path, attachment_uuid, extension):
    if not source_path or not os.path.exists(source_path):
        return None

    os.makedirs(ALLURE_RESULTS_DIR, exist_ok=True)
    source_name = f"{attachment_uuid}-attachment{extension}"
    destination_path = os.path.join(ALLURE_RESULTS_DIR, source_name)
    shutil.copyfile(source_path, destination_path)
    return source_name


def write_allure_text_attachment(content, attachment_uuid):
    os.makedirs(ALLURE_RESULTS_DIR, exist_ok=True)
    source_name = f"{attachment_uuid}-attachment.txt"
    destination_path = os.path.join(ALLURE_RESULTS_DIR, source_name)

    with open(destination_path, "w", encoding="utf-8") as attachment_file:
        attachment_file.write(content)

    return source_name


def allure_status_for_visual_result(result):
    if result.get("status") in {"failed", "warning", "missing_baseline", "read_error"}:
        return "failed"
    return "passed"


def write_allure_visual_result(result):
    context = parse_visual_file_context(result.get("file", "visual_comparison.png"))
    result_uuid = str(uuid.uuid4())
    start_time = int(time.time() * 1000)
    allure_status = allure_status_for_visual_result(result)
    title = build_visual_issue_title(result, context)
    summary = build_visual_issue_summary(result, context)
    attachments = []

    summary_source = write_allure_text_attachment(summary, str(uuid.uuid4()))
    attachments.append(
        {
            "name": "Visual regression summary",
            "source": summary_source,
            "type": "text/plain",
        }
    )

    for attachment_name, source_path in [
        ("Baseline screenshot", result.get("baseline_path")),
        ("Current screenshot", result.get("current_path")),
        ("Diff image - highlighted changes", result.get("diff_path")),
    ]:
        source = copy_allure_attachment(source_path, str(uuid.uuid4()), ".png")
        if source:
            attachments.append(
                {
                    "name": attachment_name,
                    "source": source,
                    "type": "image/png",
                }
            )

    stable_id = hashlib.md5(result.get("file", result_uuid).encode("utf-8")).hexdigest()
    allure_result = {
        "uuid": result_uuid,
        "name": title,
        "historyId": stable_id,
        "testCaseId": stable_id,
        "fullName": f"visual-comparison.{context['suite']}.{context['step_key']}",
        "status": allure_status,
        "statusDetails": {
            "message": summary,
        },
        "stage": "finished",
        "steps": [
            {
                "name": "Compare baseline and current screenshot",
                "status": allure_status,
                "stage": "finished",
                "attachments": attachments,
                "parameters": [
                    {"name": "SSIM score", "value": str(result.get("score", "n/a"))},
                    {"name": "Comparison status", "value": result.get("status", "unknown")},
                ],
                "start": start_time,
                "stop": start_time,
            }
        ],
        "attachments": attachments,
        "parameters": [
            {"name": "Project", "value": context["project"]},
            {"name": "Suite", "value": f"{context['suite']} suite"},
            {"name": "Scenario", "value": context["scenario"]},
            {"name": "Step", "value": context["step"]},
        ],
        "labels": [
            {"name": "language", "value": "python"},
            {"name": "framework", "value": "ssim"},
            {"name": "parentSuite", "value": context["project"]},
            {"name": "subSuite", "value": f"{context['suite']} suite"},
            {"name": "tag", "value": context["suite"]},
            {"name": "tag", "value": "visual"},
            {"name": "tag", "value": "visual-regression"},
        ],
        "links": [],
        "start": start_time,
        "stop": start_time,
    }

    if is_add_to_cart_displacement(result):
        allure_result["labels"].extend(
            [
                {"name": "tag", "value": "cart"},
                {"name": "tag", "value": "add-to-cart"},
                {"name": "tag", "value": "button-displacement"},
            ]
        )

    result_path = os.path.join(ALLURE_RESULTS_DIR, f"{result_uuid}-result.json")
    with open(result_path, "w", encoding="utf-8") as result_file:
        json.dump(allure_result, result_file, indent=2)


def write_allure_visual_results(results):
    changed_results = [
        result
        for result in results
        if result.get("status") in {"failed", "warning", "missing_baseline", "read_error"}
    ]

    for result in changed_results:
        write_allure_visual_result(result)

    if changed_results:
        print(f"Allure visual comparison results saved in: {ALLURE_RESULTS_DIR}")


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
    global FAIL_ON_VISUAL_DIFF

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
    FAIL_ON_VISUAL_DIFF = os.getenv("FAIL_ON_VISUAL_DIFF", "false").strip().lower() == "true"


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
    json_report = []
    current_files = list_pngs(CURRENT_DIR)
    baseline_files = set(list_pngs(BASELINE_DIR))

    if not current_files:
        print("No current screenshots found in screenshots/current.\n")
        return True

    if not baseline_files:
        create_baseline_from_current(current_files)
        return True

    print("Comparing screenshots...\n")
    print(f"Pass threshold: {SSIM_THRESHOLD:.2f}")
    print(f"Detailed analysis threshold: {DETAIL_ANALYSIS_THRESHOLD:.2f}\n")

    for file_name in current_files:
        base_path = os.path.join(BASELINE_DIR, file_name)
        curr_path = os.path.join(CURRENT_DIR, file_name)
        result = {
            "file": file_name,
            "baseline_path": base_path,
            "current_path": curr_path,
        }

        if not os.path.exists(base_path):
            report.append(f"{file_name} -> No baseline found")
            result["status"] = "missing_baseline"
            json_report.append(result)
            continue

        img1 = cv2.imread(base_path)
        img2 = cv2.imread(curr_path)

        if img1 is None or img2 is None:
            report.append(f"{file_name} -> Error reading image")
            result["status"] = "read_error"
            json_report.append(result)
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
        result["diff_path"] = diff_path
        result["regions"] = regions
        result["score"] = round(float(score), 6)
        result["difference_summary"] = region_summary

        if score < SSIM_THRESHOLD:
            explanation = get_llm_analysis(file_name, score, diff_path)
            report.append(f"{file_name} -> UI Changed (Score: {score:.3f})")
            report.append(f"   Difference Summary: {region_summary}")
            report.append(f"   AI Insight: {explanation}")
            report.append(f"   Diff Image: {diff_path}\n")
            result["status"] = "failed"
            result["ai_insight"] = explanation
        elif score < DETAIL_ANALYSIS_THRESHOLD:
            explanation = get_llm_analysis(file_name, score, diff_path)
            report.append(
                f"{file_name} -> OK but visually different in detail (Score: {score:.3f})"
            )
            report.append(f"   Difference Summary: {region_summary}")
            report.append(f"   AI Insight: {explanation}")
            report.append(f"   Diff Image: {diff_path}\n")
            result["status"] = "warning"
            result["ai_insight"] = explanation
        else:
            report.append(f"{file_name} -> OK (Score: {score:.3f})")
            report.append(f"   Difference Summary: {region_summary}")
            report.append(f"   Diff Image: {diff_path}")
            result["status"] = "passed"

        json_report.append(result)

    report_path = os.path.join(REPORTS_DIR, "report.txt")
    with open(report_path, "w", encoding="utf-8") as report_file:
        for line in report:
            report_file.write(line + "\n")

    json_report_path = os.path.join(REPORTS_DIR, "report.json")
    with open(json_report_path, "w", encoding="utf-8") as report_file:
        json.dump(
            {
                "summary": {
                    "total": len(json_report),
                    "passed": sum(1 for item in json_report if item.get("status") == "passed"),
                    "warning": sum(1 for item in json_report if item.get("status") == "warning"),
                    "failed": sum(1 for item in json_report if item.get("status") == "failed"),
                    "missing_baseline": sum(
                        1 for item in json_report if item.get("status") == "missing_baseline"
                    ),
                },
                "results": json_report,
            },
            report_file,
            indent=2,
        )

    write_allure_visual_results(json_report)

    print("\nVISUAL TEST REPORT:\n")
    for line in report:
        print(line)

    print(f"\nDiff images saved in: {DIFF_DIR}")
    print(f"JSON report saved in: {json_report_path}")

    has_failure = any(
        item.get("status") in {"failed", "missing_baseline", "read_error"}
        for item in json_report
    )
    return not (FAIL_ON_VISUAL_DIFF and has_failure)


if __name__ == "__main__":
    load_config()
    if not compare_images():
        sys.exit(1)
