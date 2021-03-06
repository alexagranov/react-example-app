import React, { Component, PropTypes } from 'react';
import { Button } from 'react-bootstrap';

import BusyAdapter from '../lib/BusyAdapter';
import Scheduler from '../lib/Scheduler';
import StateUpdaterForDatePicker from '../lib/StateUpdaterForDatePicker';

import './Bookie.css';

import PickerItemList from './PickerItemList.jsx';
import PickerDateRange from './PickerDateRange.jsx';

class Bookie extends Component {
  constructor() {
    super();
    this.state = {
      loading: false,
      initialized: false,

      // date time picker
      dayData: {},
      daysToFetch: [],

      daysFrameStart: undefined,
      hoursFrameStart: undefined,
      daysFrame: [],
      hoursFrame: [],
      qMinutesFrame: [],

      dayPicked: undefined,
      hourPicked: undefined,
      minutesIdxPicked: undefined,

      forbidDayBack: false,
      forbidHourBack: false,
      forbidDayForward: false,
      forbidHourForward: false,

      // range
      pickingStartNotEnd: true,
      isFocused: false,
      startVal: undefined,
      startValStr: undefined,
      endVal: undefined,
      endValStr: undefined,

      // booking
      bookingAllowed: false
    };
  }

  setParentLoading(loading) {
    if (this.props.onSetLoading)
      this.props.onSetLoading(loading);
  }

  negotiateStateDiff(diff, setLoading = false) {
    if (!this.state.loading || setLoading) {
      const pickerUpdater = new StateUpdaterForDatePicker(this.state, diff);
      pickerUpdater.adjust();
      if (setLoading)
        this.setParentLoading(pickerUpdater.state().loading);
      console.log('applying diff', diff, pickerUpdater.diff());
      this.setState(pickerUpdater.diff(), () => { this.pullMissingData(); });
    }
  }

  pullMissingData() {
    if (!this.state.loading) {
      const { daysToFetch } = this.state;

      if (daysToFetch.length) {
        const dayToFetch = daysToFetch[0];

        this.setParentLoading(true);
        this.setState({ loading: true }, () => {
          BusyAdapter.getServiceAvailableSlotsByIdPromise(dayToFetch)
            .then((slotData) => {
              let { daysToFetch, dayData } = this.state;
              const parsedData = Scheduler.getDayDataFromSlots(slotData);
              Object.assign(dayData, parsedData);
              daysToFetch = daysToFetch.filter(val => !dayData[val] && dayToFetch !== val);
              this.negotiateStateDiff({ dayData, daysToFetch, loading: false }, true);
            })
            .catch((ex) => {
              console.log('exception caught!', ex);
              this.negotiateStateDiff({ loading: false }, true);
            });
        });
      }
    }
  }

  componentWillMount() {
    this.negotiateStateDiff({ initialized: true });
  }

  clickQuarter(index) {
    this.negotiateStateDiff({ minutesIdxPicked: index });
  }

  clickHour(item) {
    const s = this.state;

    const dateShifter = (hourIncrement) => {
      const diff = Scheduler.getStructuredIncrement(s.dayPicked, s.hoursFrameStart, 'hours', hourIncrement);
      return { dayPicked: diff.day, hoursFrameStart: diff.hour };
    }

    if ('rev' === item.val) {
      this.negotiateStateDiff(dateShifter(-2));
    } else if ('fwd' === item.val) {
      this.negotiateStateDiff(dateShifter(2));
    } else {
      this.negotiateStateDiff({ dayPicked: item.day, hourPicked: item.hour, minutesIdxPicked: undefined });
    }
  }

  clickDay(item) {
    const s = this.state;

    const dayShifter = (hourDiff) => {
      const increment = Scheduler.getStructuredIncrement(s.daysFrameStart, 0, 'days', hourDiff);
      return { daysFrameStart: increment.day };
    }

    if ('rev' === item.val) {
      this.negotiateStateDiff(dayShifter(-1));
    } else if ('fwd' === item.val) {
      this.negotiateStateDiff(dayShifter(1));
    } else {
      this.negotiateStateDiff({ dayPicked: item.val, hourPicked: undefined, minutesIdxPicked: undefined });
    }
  }

  onPickerDateRangeEvent(isStartNotEnd, eventName, value) {
    let diff = {};
    if ('click' === eventName) {
      // we won't go picking range end if start datetime is not picked
      if (isStartNotEnd || this.state.startVal)
        diff = { pickingStartNotEnd: isStartNotEnd, isFocused: false };
    }
    else if ('blur' === eventName)
      diff = { isFocused: false, rangeEndValEntered: value };
    this.negotiateStateDiff(diff);
  }

  render() {
    const {
      forbidDayBack, forbidHourBack, forbidDayForward, forbidHourForward,
      daysFrame, hoursFrame, qMinutesFrame,
      pickingStartNotEnd, isFocused, startValStr, endValStr,
      bookingAllowed,
      lastBooking
    } = this.state;

    return <div className="bookie-container">
      <PickerItemList className="pick-day"
        items={daysFrame}
        onClick={(item, index) => { this.clickDay(item); } }
        wrapWithArrows
        forbidBack={forbidDayBack}
        forbidForward={forbidDayForward}
        />

      <PickerItemList className="pick-minutes"
        items={qMinutesFrame}
        onClick={(item, index) => { this.clickQuarter(index); } }
        />

      <PickerItemList className="pick-hour"
        items={hoursFrame}
        onClick={(item, index) => { this.clickHour(item); } }
        wrapWithArrows
        forbidBack={forbidHourBack}
        forbidForward={forbidHourForward}
        />

      <PickerDateRange {...{ pickingStartNotEnd, isFocused, startValStr, endValStr }}
        onEvent={(isStart, eventName, value) => { this.onPickerDateRangeEvent(isStart, eventName, value) } }
        />

      <div className="text-center">
        <Button
          disabled={!bookingAllowed}
          onClick={() => { this.createBooking(true); } }>
          Book
        </Button>
      </div>

      {
        lastBooking && <div className="text-center">
          <div className="well" key={lastBooking.id}>
            <h3>last booking</h3>
            <p>{lastBooking.startDate.toString()}</p>
            <p>{lastBooking.startTime}</p>
            <p>{lastBooking.totalMinutes}</p>
            <Button onClick={() => {
              BusyAdapter.cancelBookingPromise(lastBooking.id).then(response => { console.log('cancelling booking: ', lastBooking.id, response); });
            } }>
              drop
            </Button>
          </div>
        </div>
      }

    </div>;
  }

  createBooking(settingDelay = true) {
    const { startVal, endVal } = this.state;
    if (startVal && (endVal || !settingDelay)) {
      const [bookingArgs, requestDaysToFetch] = Scheduler.composeBookingData(startVal, endVal, settingDelay);
      console.log(bookingArgs);
      BusyAdapter.createBookingPromise(bookingArgs)
        .then(response => {
          console.log('creating booking: ', response);
          const { id, timeWindow: { startDate, startTime, totalMinutes } } = response.booking || {};

          this.negotiateStateDiff({
            pickingStartNotEnd: true,
            startVal: endVal,
            endVal: undefined,
            dayPicked: undefined,
            hourPicked: undefined,
            minutesIdxPicked: undefined,
            requestDaysToFetch,
            lastBooking: (response.booking ? { id, startDate, startTime, totalMinutes } : undefined),
          });
        })
        .catch(ex => { console.log('failed to create booking, ', ex) });
    }
  }
}

Bookie.propTypes = {
  onSetLoading: PropTypes.func
};

export default Bookie;
