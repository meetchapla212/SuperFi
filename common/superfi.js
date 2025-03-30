const _ = require("lodash");
const moment = require("moment");
const DB = require("./../common/dbmanager");
const DBManager = new DB();
const CARD_FIX_MIN_MONTHLY_AMOUNT = 25;
const dateFormat = "YYYY-MM-DD HH:mm:ss";

// This function is used to calculate debt with avalanche method.
const avalancheCalculation = function (payAmount, cardsAccounts, nonCalculationAccounts) {
  return new Promise(async (resolve, reject) => {
    try {
      let totalDebt = 0;
      let totalInterest = 0;
      let totalMonths = 0;
      let toPayOffCards = JSON.parse(JSON.stringify(cardsAccounts.sort(sortAvalanche)));
      // Calculate the first month debt
      // toPayOffCards.forEach((card) => (
      //     totalDebt += card?.user_overdraft_account_id ?
      //         card.overdraft : card.current_balance,
      //     card.calculate_balance = card?.user_overdraft_account_id ?
      //         card.overdraft : card.current_balance
      // ));
      toPayOffCards.forEach(
        (card) => (
          (totalDebt += Math.abs(card.current_balance)),
          (card.calculate_balance = Math.abs(card.current_balance)),
          (card.calculate_minimum_repayment = card.updated_minimum_repayment || 0),
          (card.calculate_interest_rate = card.updated_interest_rate || card.custom_interest_rate || card.interest_rate)
        )
      );

      // At this point, we know the user has enough cash to pay off the minimum payment towards all cards and accounts or alteast £25
      // Left over will be paid towards the higest interest_rate card
      while (totalDebt > 0) {
        let availableBalance = payAmount;
        nonCalculationAccounts.forEach((account) => {
          if (account.klarna_id) {
            if (account.payment_schedule == "Pay in 30 days") {
              let paymentCompleted = account?.payment_completed || false;
              if (!paymentCompleted) {
                let dateOfPurchase = account.date_of_purchase ? moment.utc(account.date_of_purchase).format(dateFormat) : "";
                // let paymentDueDate = dateOfPurchase ? moment.utc(dateOfPurchase).add(1, 'M').format(dateFormat) : '';
                let currentDate = moment.utc().add(totalMonths, "M").format(dateFormat);

                if (currentDate >= dateOfPurchase && totalMonths == 0) {
                  availableBalance -= Math.abs(+account.price_of_purchase);
                }
              }
            } else if (account.payment_schedule == "Pay in 3 installments" && totalMonths < 2) {
              let resultInstallments = account?.installments || [];
              let currentDate = moment.utc().add(totalMonths, "M");
              resultInstallments.forEach((rowInstallment, index) => {
                if (!rowInstallment.completed) {
                  // if (moment(rowInstallment.installments_date).format("MM") == currentDate.format("MM")) {
                  if (totalMonths == 0 && index == 2) {
                    availableBalance -= Math.abs(+rowInstallment.installment_amount);
                    availableBalance = !resultInstallments[index - 1].completed
                      ? availableBalance - Math.abs(+resultInstallments[index - 1].installment_amount)
                      : availableBalance;
                  } else {
                    availableBalance -= Math.abs(+rowInstallment.installment_amount);
                  }
                  // }
                }
              });
            }
          }
        });
        let totalMonthlyDebtPaid = 0; // To keep track of the monthly balance available towards debt
        totalMonths += 1;
        let cardInterests = [];
        totalDebt = Math.floor(totalDebt);

        // Pay all cards and accounts minimum payments.
        await Promise.all(
          toPayOffCards.map(async (card) => {
            // Calculate card min monthly and interest every iteration.
            const balance = Number.parseFloat(card.calculate_balance.toString().replace(/[^0-9\.]+/g, ""));
            const interest_rate = card.calculate_interest_rate ? +card.calculate_interest_rate : 0;
            var interest = +(balance * (interest_rate / 100 / 12)).toFixed(2);
            var minMonthly = +(0.01 * balance).toFixed(2) + interest;
            if (card.calculate_minimum_repayment) {
              minMonthly = card.calculate_minimum_repayment;
            }
            if (balance < CARD_FIX_MIN_MONTHLY_AMOUNT) {
              minMonthly = balance;
              interest = 0;
            } else if (minMonthly < CARD_FIX_MIN_MONTHLY_AMOUNT) {
              minMonthly = CARD_FIX_MIN_MONTHLY_AMOUNT;
            }

            cardInterests.push(interest);
            if (card.calculate_balance > 0) {
              const MONTHLY_PAYMENT = minMonthly;
              // Pays.
              card.calculate_balance -= MONTHLY_PAYMENT;
              card.suggested_balance = MONTHLY_PAYMENT;
              totalDebt -= MONTHLY_PAYMENT;
              totalMonthlyDebtPaid += MONTHLY_PAYMENT; // Add interest to total monthly debt.
            }
          })
        ).then(async () => {
          let leftOverBalance = +(availableBalance - totalMonthlyDebtPaid).toFixed(2);
          let counter = -1;
          // Pay cards and accounts with left over balance.
          await Promise.all(
            toPayOffCards.map(async (card) => {
              counter += 1;
              if (card.calculate_balance > 0) {
                const interestAdded = cardInterests[counter];
                card.calculate_balance += +interestAdded.toFixed(2);
                // Pay left over balance to high interest card.
                if (leftOverBalance < card.calculate_balance) {
                  card.calculate_balance -= +leftOverBalance.toFixed(2);
                  // card.calculate_balance += +interestAdded.toFixed(2)
                  card.suggested_balance = +(card.suggested_balance ? card.suggested_balance + leftOverBalance : leftOverBalance).toFixed(2);
                  totalDebt -= +leftOverBalance.toFixed(2);
                  totalDebt += +interestAdded.toFixed(2);

                  totalInterest += interestAdded;
                  leftOverBalance = 0;
                }
                // Left over balance is more than needed for this card.
                else if (leftOverBalance >= card.calculate_balance) {
                  card.suggested_balance = +(card.suggested_balance ? card.suggested_balance + card.calculate_balance : leftOverBalance).toFixed(2);
                  leftOverBalance -= +card.calculate_balance.toFixed(2);
                  totalDebt -= +card.calculate_balance.toFixed(2);

                  card.calculate_balance = 0;
                }
              }
            })
          );

          // Pay cards and accounts with left over balance.
          // for (let card of toPayOffCards) {
          //     console.log("cards", card)
          //     counter += 1
          //     if (card.calculate_balance <= 0) {
          //         continue
          //     }
          //     const interestAdded = cardInterests[counter];
          //     card.calculate_balance += +interestAdded.toFixed(2)
          //     // Pay left over balance to high interest card.
          //     if (leftOverBalance < card.calculate_balance) {
          //         card.calculate_balance -= +leftOverBalance.toFixed(2)
          //         // card.calculate_balance += +interestAdded.toFixed(2)
          //         card.suggested_balance = +(card.suggested_balance ? card.suggested_balance + leftOverBalance : leftOverBalance).toFixed(2)
          //         totalDebt -= +leftOverBalance.toFixed(2)
          //         totalDebt += +interestAdded.toFixed(2)

          //         totalInterest += interestAdded
          //         leftOverBalance = 0
          //         break
          //     }
          //     console.log('totalInterest1', totalInterest)
          //     // Left over balance is more than needed for this card.
          //     if (leftOverBalance >= card.calculate_balance) {
          //         card.suggested_balance = +(card.suggested_balance ? card.suggested_balance + card.calculate_balance : leftOverBalance).toFixed(2)
          //         leftOverBalance -= +card.calculate_balance.toFixed(2)
          //         totalDebt -= +card.calculate_balance.toFixed(2)

          //         card.calculate_balance = 0
          //         continue
          //     }
          // }
        });
        if (totalMonths == 1) {
          toPayOffCards.forEach((card) => {
            card.suggested_payment = card.suggested_balance;
            card.initial_suggested_payment = card.suggested_balance;
          });
        }
        if (typeof numberOfMonths === "number" && numberOfMonths === 1) {
          break;
        }
        if (totalMonths === 5000) {
          break;
        }
      }
      if (totalMonths < 2) {
        nonCalculationAccounts.forEach((account) => {
          if (account.klarna_id && account.payment_schedule == "Pay in 3 installments") {
            totalMonths = 2;
          } else if (account.klarna_id && account.payment_schedule == "Pay in 30 days") {
            totalMonths = 1;
          }
        });
      }
      //  toPayOffCards.forEach((card) => (card.current_balance = card.original_current_balance, delete card.original_current_balance));
      resolve({
        status: true,
        data: { totalMonths, totalInterest: +totalInterest.toFixed(2), pay_amount: payAmount, cards_accounts: toPayOffCards },
      });
    } catch (err) {
      resolve({ status: false, message: err?.message || "Avalanche method not calculated." });
    }
  });
};
// This function is used to calculate debt with snowball method.
const snowballCalculation = function (payAmount, cardsAccounts, nonCalculationAccounts) {
  return new Promise(async (resolve, reject) => {
    try {
      let totalDebt = 0;
      let totalInterest = 0;
      let totalMonths = 0;
      // let toPayOffCards = JSON.parse(JSON.stringify(_.sortBy(cardsAccounts, 'current_balance')));

      // Calculate the first month debt.
      // cardsAccounts.forEach((card) => (
      //     totalDebt += card?.user_overdraft_account_id ?
      //     card.overdraft : card.current_balance,
      //     card.calculate_balance = card?.user_overdraft_account_id ?
      //      card.overdraft : card.current_balance))

      cardsAccounts.forEach(
        (card) => (
          (totalDebt += Math.abs(card.current_balance)),
          (card.calculate_balance = Math.abs(card.current_balance)),
          (card.calculate_minimum_repayment = card.updated_minimum_repayment || 0),
          (card.calculate_interest_rate = card.updated_interest_rate || card.custom_interest_rate || card.interest_rate)
        )
      );
      let toPayOffCards = JSON.parse(JSON.stringify(cardsAccounts.sort(sortSnowball)));

      while (totalDebt > 0) {
        let availableBalance = payAmount;
        nonCalculationAccounts.forEach((account) => {
          if (account.klarna_id) {
            if (account.payment_schedule == "Pay in 30 days") {
              let paymentCompleted = account?.payment_completed || false;
              if (!paymentCompleted) {
                let dateOfPurchase = account.date_of_purchase ? moment.utc(account.date_of_purchase).format(dateFormat) : "";
                //let paymentDueDate = dateOfPurchase ? moment.utc(dateOfPurchase).add(1, 'M').format(dateFormat) : '';
                let currentDate = moment.utc().add(totalMonths, "M").format(dateFormat);

                if (currentDate >= dateOfPurchase && totalMonths == 0) {
                  availableBalance -= Math.abs(+account.price_of_purchase);
                }
              }
            } else if (account.payment_schedule == "Pay in 3 installments" && totalMonths < 2) {
              let resultInstallments = account?.installments || [];
              let currentDate = moment.utc().add(totalMonths, "M");
              resultInstallments.forEach((rowInstallment, index) => {
                if (!rowInstallment.completed) {
                  // if (moment(rowInstallment.installments_date).format("MM") == currentDate.format("MM")) {
                  if (totalMonths == 0 && index == 2) {
                    availableBalance -= Math.abs(+rowInstallment.installment_amount);
                    availableBalance = !resultInstallments[index - 1].completed
                      ? availableBalance - Math.abs(+resultInstallments[index - 1].installment_amount)
                      : availableBalance;
                  } else {
                    availableBalance -= Math.abs(+rowInstallment.installment_amount);
                  }
                }
                // }
              });
            }
          }
        });
        let totalMonthlyDebtPaid = 0; // To keep track of the monthly balance available towards debt.
        totalMonths += 1;
        let cardInterests = [];
        totalDebt = Math.floor(totalDebt);

        await Promise.all(
          toPayOffCards.map(async (card) => {
            // Calculate card min monthly and interest every iteration.
            const balance = Number.parseFloat(card.calculate_balance.toString().replace(/[^0-9\.]+/g, ""));
            const interest_rate = card.calculate_interest_rate ? +card.calculate_interest_rate : 0;
            var interest = +(balance * (interest_rate / 100 / 12)).toFixed(2);
            var minMonthly = +(0.01 * balance).toFixed(2) + interest;
            if (card.calculate_minimum_repayment) {
              minMonthly = card.calculate_minimum_repayment;
            }
            if (balance < CARD_FIX_MIN_MONTHLY_AMOUNT) {
              minMonthly = balance;
              interest = 0;
            } else if (minMonthly < CARD_FIX_MIN_MONTHLY_AMOUNT) {
              minMonthly = CARD_FIX_MIN_MONTHLY_AMOUNT;
            }

            cardInterests.push(interest);
            if (card.calculate_balance > 0) {
              const MONTHLY_PAYMENT = minMonthly;
              // Pays.
              card.calculate_balance -= MONTHLY_PAYMENT;
              card.suggested_balance = MONTHLY_PAYMENT;
              totalDebt -= MONTHLY_PAYMENT;
              totalMonthlyDebtPaid += MONTHLY_PAYMENT; // Add interest to total monthly debt.
            }
          })
        ).then(async () => {
          let leftOverBalance = +(availableBalance - totalMonthlyDebtPaid).toFixed(2);
          let counter = -1;
          await Promise.all(
            toPayOffCards.map(async (card) => {
              counter += 1;
              if (card.calculate_balance > 0) {
                const interestAdded = cardInterests[counter];
                card.calculate_balance += +interestAdded.toFixed(2);
                // Pay left over balance to high balance card.
                if (leftOverBalance < card.calculate_balance) {
                  card.calculate_balance -= +leftOverBalance.toFixed(2);
                  // card.calculate_balance += +interestAdded.toFixed(2)
                  card.suggested_balance = +(card.suggested_balance ? card.suggested_balance + leftOverBalance : leftOverBalance).toFixed(2);
                  totalDebt -= +leftOverBalance.toFixed(2);
                  totalDebt += +interestAdded.toFixed(2);

                  totalInterest += interestAdded;
                  leftOverBalance = 0;
                }
                // Left over balance is more than needed for this card.
                else if (leftOverBalance >= card.calculate_balance) {
                  card.suggested_balance = +(card.suggested_balance ? card.suggested_balance + card.calculate_balance : leftOverBalance).toFixed(2);
                  leftOverBalance -= +card.calculate_balance.toFixed(2);
                  totalDebt -= +card.calculate_balance.toFixed(2);

                  card.calculate_balance = 0;
                }
              }
            })
          );
          // for (let card of toPayOffCards) {
          //     counter += 1
          //     if (card.calculate_balance <= 0) {
          //         continue
          //     }
          //     const interestAdded = cardInterests[counter]
          //     card.outstandingBalance += +interestAdded.toFixed(2)
          //     // Pay left over balance to high balance card.
          //     if (leftOverBalance < card.calculate_balance) {
          //         card.calculate_balance -= +leftOverBalance.toFixed(2)
          //         // card.calculate_balance += +interestAdded.toFixed(2)
          //         card.suggested_balance = +(card.suggested_balance ? card.suggested_balance + leftOverBalance : leftOverBalance).toFixed(2)
          //         totalDebt -= +leftOverBalance.toFixed(2)
          //         totalDebt += +interestAdded.toFixed(2)

          //         totalInterest += interestAdded
          //         leftOverBalance = 0
          //         break
          //     }
          //     // Left over balance is more than needed for this card.
          //     if (leftOverBalance >= card.calculate_balance) {
          //         card.suggested_balance = +(card.suggested_balance ? card.suggested_balance + card.calculate_balance : leftOverBalance).toFixed(2)
          //         leftOverBalance -= +card.calculate_balance.toFixed(2)
          //         totalDebt -= +card.calculate_balance.toFixed(2)

          //         card.calculate_balance = 0
          //         continue
          //     }
          // }
        });
        if (totalMonths == 1) {
          toPayOffCards.forEach((card) => {
            card.suggested_payment = card.suggested_balance;
            card.initial_suggested_payment = card.suggested_balance;
          });
        }
        if (typeof numberOfMonths === "number" && numberOfMonths === 1) {
          break;
        }
        if (totalMonths === 5000) {
          break;
        }
      }
      if (totalMonths < 2) {
        nonCalculationAccounts.forEach((account) => {
          if (account.klarna_id && account.payment_schedule == "Pay in 3 installments") {
            totalMonths = 2;
          } else if (account.klarna_id && account.payment_schedule == "Pay in 30 days") {
            totalMonths = 1;
          }
        });
      }
      // toPayOffCards.forEach((card) => (card.current_balance = card.original_current_balance, delete card.original_current_balance));
      resolve({
        status: true,
        data: { totalMonths, totalInterest: +totalInterest.toFixed(2), pay_amount: payAmount, cards_accounts: toPayOffCards },
      });
    } catch (err) {
      resolve({ status: false, message: err?.message || "Snowball method not calculated." });
    }
  });
};
// This function is used to calculate debt with non superfi method.
const nonSuperfiCalculation = async function (cardsAccounts, nonCalculationAccounts) {
  return new Promise(async (resolve, reject) => {
    try {
      let totalDebt = 0;
      let totalMonths = 0;
      let totalInterest = 0;

      var toPayOffCards = JSON.parse(JSON.stringify(cardsAccounts));
      nonCalculationAccounts.forEach((account) => {
        if (account.klarna_id) {
          toPayOffCards.push(account);
        }
      });
      // First month total debt
      // toPayOffCards.forEach((card) => {
      //     totalDebt += card?.klarna_id ? +card.price_of_purchase : card?.user_overdraft_account_id ? +card.overdraft : +card.current_balance,
      //         card.calculate_balance = card?.klarna_id ? +card.price_of_purchase : card?.user_overdraft_account_id ? +card.overdraft : +card.current_balance
      // })

      toPayOffCards.forEach((card) => {
        (totalDebt += card?.klarna_id ? Math.abs(card.price_of_purchase) : Math.abs(card.current_balance)),
          (card.calculate_balance = card?.klarna_id ? Math.abs(card.price_of_purchase) : Math.abs(card.current_balance)),
          (card.calculate_minimum_repayment = card.updated_minimum_repayment || 0),
          (card.calculate_interest_rate = card.updated_interest_rate || card.custom_interest_rate || card.interest_rate);
      });
      while (totalDebt > 0) {
        if (totalMonths > 360) {
          break;
        }
        totalMonths += 1;
        toPayOffCards.forEach((card) => {
          const balance = Number.parseFloat(card.calculate_balance.toString().replace(/[^0-9\.]+/g, ""));
          const interest_rate = card.calculate_interest_rate ? +card.calculate_interest_rate : 0;
          var interest = +(balance * (interest_rate / 100 / 12)).toFixed(2);
          var minMonthly = +(0.01 * balance).toFixed(2) + interest;
          if (card.calculate_minimum_repayment) {
            minMonthly = card.calculate_minimum_repayment;
          }
          if (balance < CARD_FIX_MIN_MONTHLY_AMOUNT) {
            minMonthly = balance;
            interest = 0;
          } else if (minMonthly < CARD_FIX_MIN_MONTHLY_AMOUNT) {
            minMonthly = CARD_FIX_MIN_MONTHLY_AMOUNT;
          }

          // To track of the interest.
          totalInterest += interest;
          // Deduct min payment from total debt.
          totalDebt = +(totalDebt - minMonthly + interest).toFixed(2);
          // Deduct min payment from this card.
          card.calculate_balance = +(card.calculate_balance - minMonthly + interest).toFixed(2);
        });
      }
      resolve({ status: true, data: { totalMonths, totalInterest: +totalInterest.toFixed(2) } });
    } catch (err) {
      resolve({ status: false, message: err?.message || "Timeout of debt not calculated." });
    }
  });
};
// This function is used to sort cards and accounts in ascending order interest rate.
const sortAvalanche = (a, b) => {
  if (a.interest_rate && b.interest_rate) return +b.interest_rate - +a.interest_rate;
  // if (a.apr && b.fix) return +b.fix - +a.apr
  // if (a.fix && b.apr) return +b.apr - +a.fix
  return -1;
};
// This function is used to sort cards and accounts in ascending order balance.
const sortSnowball = (a, b) => {
  if (a.calculate_balance && b.calculate_balance) return +a.calculate_balance - +b.calculate_balance;
  return 1;
};
// This function is used to update application screen last visit date time.
const updateScreenVisitDate = (screen_name, user_id) => {
  return new Promise(async (resolve, reject) => {
    try {
      // Update cashback screen last visit data
      var resultScreenVisit = await DBManager.getData("users_screen_last_visit", "*", { _user_id: user_id });
      var rowScreenVisit = resultScreenVisit?.rows || [];
      if (rowScreenVisit && rowScreenVisit.length) {
        await DBManager.runQuery(
          `UPDATE users_screen_last_visit SET ${screen_name} =  '${moment().utc().format(dateFormat)}' WHERE _user_id = '${user_id}'`
        );
        // await DBManager.dataUpdate("users_screen_last_visit", { screen_name: moment().utc().format(dateFormat) }, { _user_id: user_id });
      } else {
        let insertData = {
          _user_id: user_id,
          debt_calculator_last_visit_date: "",
          credit_score_last_visit_date: "",
          cashback_last_visit_date: "",
        };
        insertData[screen_name] = moment().utc().format(dateFormat);
        await DBManager.dataInsert("users_screen_last_visit", insertData);
      }
      return resolve({ status: true, message: "Updated screen last vist date" });
    } catch (err) {
      return resolve({ status: false, message: err?.message });
    }
  });
};

module.exports = {
  avalancheCalculation,
  snowballCalculation,
  nonSuperfiCalculation,
  updateScreenVisitDate,
};
