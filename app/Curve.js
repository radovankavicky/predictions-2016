'use strict'

const ElectionDayS = '2016-11-08'
const StartDayS = '2016-07-01' // Expect bizarre errors if you change this
const NDays = Math.round((new Date(ElectionDayS) - new Date(StartDayS)) / 86400000) + 1

const ChartHeight = 600
const ChartWidth = 1000
const DateWidth = ChartWidth / (NDays - 1)

const UInt16Max = 0xffff

/**
 * Returns a fraction in the range [ -1.0, 1.0 ]
 */
function uint16_to_fraction(uint16) {
  return (uint16 / UInt16Max) * 2 - 1
}

/**
 * Calls `f` (Math.max or Math.min) on all uint16_samples -- each being a curve
 * of uint16 values.
 */
function simple_reduce_samples(uint16_samples, f) {
  const plotted_u16s = uint16_samples.map(u16s => u16s.slice(Math.max(0, u16s.length - NDays)))
  const one_per_sample = plotted_u16s.map(u16s => f.apply(null, u16s))
  return f.apply(null, one_per_sample)
}

function render_path_d_for_ys(ys, y_max) {
  let last_y = 0
  let last_x = 0
  let first = true

  const steps = new Array(ys.length)

  for (let i = 0; i < ys.length; i++) {
    const y = ys[i]
    const x = Math.round(DateWidth * i)

    const dx = x - last_x
    const dy = y - last_y

    last_y = y
    last_x = x

    if (first) {
      first = false
      steps[i] = `M${dx},${dy}`
    } else {
      steps[i] = `${dx},${dy}`
    }
  }

  return steps.join('l')
}

function calculate_sample_path_d(uint16s, y_max) {
  const convert_y = ChartHeight / 2 / y_max
  const values = uint16s.map(v => Math.round(ChartHeight / 2 - convert_y * uint16_to_fraction(v)))
  return render_path_d_for_ys(values, y_max)
}

function values_to_path_d(raw_values, y_max) {
  const convert_y = ChartHeight / 2 / y_max
  const values = raw_values.map(v => Math.round(ChartHeight / 2 - convert_y * v))
  return render_path_d_for_ys(values, y_max)
}

module.exports = class Curve {
  constructor(updated_at, points, polls, uint16_samples) {
    this.updated_at = updated_at
    this.election_day_point = points[points.length - 1]
    this.polls = polls

    this.is_plottable = uint16_samples.length > 0
    this.NDays = NDays

    if (this.is_plottable) {
      const max_y_uint16 = simple_reduce_samples(uint16_samples, Math.max)
      const min_y_uint16 = simple_reduce_samples(uint16_samples, Math.min)
      const max_diff = Math.max(Math.abs(uint16_to_fraction(max_y_uint16)), Math.abs(uint16_to_fraction(min_y_uint16)))

      // y_max: make sure it's divisible by 2
      this.y_max = [ 0.04, 0.08, 0.10, 0.16, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 0.90, 1.0 ].find(y => y >= max_diff)
      this.date_width = DateWidth

      // Today is `updated_at_x` days from the start of this chart
      this.updated_at_x = Math.round((new Date(updated_at.toISOString().slice(0, 10)) - new Date(StartDayS)) / 86400000)

      this.points = points
      this.uint16_samples = uint16_samples
    }
  }

  calculate_sample_svg_paths() {
    return this.uint16_samples.map(uint16s => calculate_sample_path_d(uint16s, this.y_max))
  }

  today_spread_html() {
    const point = this.points[this.updated_at_x]
    const leader = point.diff_xibar > 0 ? 'D' : 'R'
    const xibar_s = Math.abs(point.diff_xibar * 100).toFixed(1)

    if (xibar_s == '0.0') {
      return '<span class="toss-up">Tied</span>'
    } else {
      return `<span class="${leader == 'D' ? 'dem' : 'gop'}-lead">${leader}+${xibar_s}</span>`
    }
  }

  /**
   * Returns an Array of { x, y, html_class } Objects: one per poll
   */
  calculate_poll_coordinates() {
    const convert_y = ChartHeight / 2 / this.y_max

    function poll_to_coordinates(poll) {
      const x = Math.round((new Date(poll.end_date) - new Date(StartDayS)) / 86400000 * DateWidth)
      const y = Math.round(ChartHeight / 2 - convert_y * poll.diff / 100)
      const html_class = poll.diff > 0 ? 'poll-dem' : (poll.diff < 0 ? 'poll-gop' : 'poll-toss-up')
      return { x: x, y: y, html_class: html_class }
    }

    return this.polls.map(poll_to_coordinates)
  }

  /**
   * Calculates "M0,0..." -- a line
   *
   * Assumes a 1000*600 chart size. The top 300 are positive spread; the bottom
   * 300 are negative spread. All values are integers (to save space).
   */
  svg_path(key) {
    return values_to_path_d(this.points.map(p => p === null ? null : p[key]), this.y_max)
  }
}
